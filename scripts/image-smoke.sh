#!/usr/bin/env bash
set -euo pipefail

# Phase 6 全栈镜像 smoke（plan §10.8）——两级门禁，发布镜像与被 smoke 的构建产物严格一致：
#
#   Tier-1 exact（发布镜像，确定性，零真实上游）：对「已被 docker load 的精确发布镜像」
#     起容器验证运行时核心输出——前端 / 200 + 应用根内容 + 容器存活。发布镜像不烤内部
#     smoke hostname（FXRATE_PROXY 保持生产默认），因此这里不断言 /api/fxrate 代理。
#   Tier-2 contract（契约镜像，不发布）：单独构建带 --build-arg FXRATE_PROXY 指向
#     smoke 后端的镜像对，验证构建期代理机制——后端 /info、/readyz 契约、/metrics 8 family、
#     JSON-RPC instanceInfo、前端 / 与 /api/fxrate → smoke 后端。证明 build-arg 生效，
#     但不把该镜像推送到任何 registry。
#
# 发布门禁默认「确定性」：/info、/readyz 只验证契约形状（200/503 + 字段），不等真实
# 银行就绪；--require-ready 是可选开关（需要真实上游，仅供本机人工验证，不进 CI）。
#
# 模式：
#   --exact --image TAG   Tier-1：smoke 已加载的精确发布镜像。
#   （无 flags，默认）    Tier-2 contract：docker 构建后端 + 契约前端镜像并跑全链路检查。
#   --local               Tier-2 local（无 Docker）：node dist 起后端 + next dev 起前端。
# 用法：bash scripts/image-smoke.sh [--exact --image TAG] [--expected-proxy URL]
#       [--local] [--require-ready]
#       [--backend-port N] [--web-port N] [--wait-ready SECONDS] [--keep]

MODE=contract
BACKEND_PORT=18081
WEB_PORT=13000
BACKEND_IMAGE=fxrate-backend-smoke
WEB_IMAGE=fxrate-web-smoke
BACKEND_CONTAINER=fxrate-backend-smoke
WEB_CONTAINER=fxrate-web-smoke
NETWORK=fxrate-plan-smoke
REQUIRE_READY=no
WAIT_READY=300
KEEP=0
WORKDIR=""
EXPECTED_PROXY="https://fxrate.sunoaki.net/v1/jsonrpc"

usage() {
    cat <<'EOF'
Usage: bash scripts/image-smoke.sh [options]

  --exact --image TAG   Tier-1: smoke an already-loaded exact release image (boot + /).
  --expected-proxy URL  Expected build-time proxy reported by /api/backend-meta.
  --local               Tier-2 local: spawn backend (node dist) + frontend (next dev).
  --backend-port N      Backend port. Default 18081.
  --web-port N          Frontend port. Default 13000.
  --require-ready       OPT-IN: wait until backend /readyz reports ok (needs real
                        upstreams; NOT part of the deterministic release smoke).
  --wait-ready SECONDS  Max seconds to wait for readiness. Default 300.
  --keep                Do not remove containers/network on exit (debugging).
  -h, --help            Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --exact) MODE=exact; shift ;;
        --image) WEB_IMAGE="$2"; shift 2 ;;
        --expected-proxy) EXPECTED_PROXY="$2"; shift 2 ;;
        --local) MODE=local; shift ;;
        --backend-port) BACKEND_PORT="$2"; shift 2 ;;
        --web-port) WEB_PORT="$2"; shift 2 ;;
        --require-ready) REQUIRE_READY=yes; shift ;;
        --no-require-ready) REQUIRE_READY=no; shift ;;
        --wait-ready) WAIT_READY="$2"; shift 2 ;;
        --keep) KEEP=1; shift ;;
        -h | --help) usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
    esac
done

if [[ "$MODE" == "exact" && "$WEB_IMAGE" == "fxrate-web-smoke" ]]; then
    echo "FAIL: --exact requires --image TAG (the exact release image already loaded locally)" >&2
    exit 2
fi

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

WORKDIR=$(mktemp -d)
trap cleanup EXIT
cleanup() {
    rm -rf "$WORKDIR"
    if [[ "$MODE" == "contract" && "$KEEP" != "1" ]]; then
        docker rm -f "$WEB_CONTAINER" "$BACKEND_CONTAINER" >/dev/null 2>&1 || true
        docker network rm "$NETWORK" >/dev/null 2>&1 || true
    elif [[ "$MODE" == "exact" && "$KEEP" != "1" ]]; then
        docker rm -f "$WEB_CONTAINER" >/dev/null 2>&1 || true
    elif [[ "$MODE" == "local" ]]; then
        for pid in "${LOCAL_PIDS[@]:-}"; do
            kill -- "-$pid" 2>/dev/null || true
        done
        wait "${LOCAL_PIDS[@]}" 2>/dev/null || true
    fi
}

# 以独立进程组（setsid）拉起本地进程，cleanup 按组 kill，避免只杀到 bash 外壳漏掉子进程。
spawn_local() {
    setsid bash -c "$1" </dev/null >"$2" 2>&1 &
    LOCAL_PIDS+=("$!")
}

wait_http() {
    local url="$1" timeout_seconds="$2"
    local deadline=$((SECONDS + timeout_seconds))
    until curl --silent --show-error --output /dev/null --max-time 2 "$url" 2>/dev/null; do
        if [[ $SECONDS -ge $deadline ]]; then
            fail "server did not answer $url within ${timeout_seconds}s"
        fi
        sleep 1
    done
}

json_get() {
    node -e "const d=JSON.parse(process.argv[1]);const p=process.argv[2].split('.');let v=d;for(const k of p){if(v==null)process.exit(3);v=v[k];}if(typeof v==='object'&&v!==null){console.log(JSON.stringify(v));}else{console.log(String(v));}" "$1" "$2"
}

# 后端契约（与 lib/fxrate/scripts/image-smoke.sh 的 check_backend 保持同一组断言）。
check_backend() {
    local base="$1"

    local info_status info_body
    info_status=$(curl --silent --show-error --output "$WORKDIR/info.json" --write-out '%{http_code}' --max-time 10 "$base/info")
    info_body=$(cat "$WORKDIR/info.json")
    if [[ "$info_status" != "200" && "$info_status" != "503" ]]; then
        fail "/info returned HTTP $info_status (expected 200 or 503)"
    fi
    local status_field version_field
    status_field=$(json_get "$info_body" status) || fail "/info body missing status: $info_body"
    version_field=$(json_get "$info_body" version) || fail "/info body missing version: $info_body"
    [[ "$status_field" == "ok" || "$status_field" == "degraded" ]] || fail "/info status='$status_field'"
    [[ -n "$version_field" ]] || fail "/info version is empty"
    pass "/info HTTP $info_status status=$status_field version=$version_field"

    local ready_status ready_body
    ready_status=$(curl --silent --show-error --output "$WORKDIR/ready.json" --write-out '%{http_code}' --max-time 10 "$base/readyz")
    ready_body=$(cat "$WORKDIR/ready.json")
    if [[ "$ready_status" != "200" && "$ready_status" != "503" ]]; then
        fail "/readyz returned HTTP $ready_status"
    fi
    json_get "$ready_body" status >/dev/null || fail "/readyz body missing status: $ready_body"
    pass "/readyz HTTP $ready_status"

    local metrics_body
    metrics_body=$(curl --fail --silent --show-error --max-time 10 "$base/metrics") || fail "/metrics curl failed"
    for family in \
        fxrate_rpc_batch_items fxrate_rpc_rejected_total fxrate_work_active \
        fxrate_work_queue_wait_seconds fxrate_source_fetch_seconds fxrate_chromium_active \
        fxrate_cache_hits_total fxrate_shutdown_seconds; do
        grep -q "^# HELP ${family} " <<<"$metrics_body" || fail "/metrics missing family $family"
        grep -q "^# TYPE ${family} " <<<"$metrics_body" || fail "/metrics missing TYPE $family"
    done
    pass "/metrics exposes all 8 metric families"

    local rpc_code rpc_body
    rpc_code=$(curl --silent --show-error --output "$WORKDIR/rpc.json" --write-out '%{http_code}' --max-time 10 \
        --header 'content-type: application/json' \
        --data '{"jsonrpc":"2.0","id":1,"method":"instanceInfo","params":{}}' \
        "$base/v1/jsonrpc")
    rpc_body=$(cat "$WORKDIR/rpc.json")
    [[ "$rpc_code" == "200" ]] || fail "JSON-RPC instanceInfo returned HTTP $rpc_code"
    json_get "$rpc_body" jsonrpc | grep -qx '2.0' || fail "JSON-RPC bad jsonrpc version: $rpc_body"
    json_get "$rpc_body" id | grep -qx '1' || fail "JSON-RPC bad id: $rpc_body"
    local rpc_version
    rpc_version=$(json_get "$rpc_body" result.version) || fail "JSON-RPC result.version missing: $rpc_body"
    [[ -n "$rpc_version" ]] || fail "JSON-RPC result.version empty"
    pass "JSON-RPC instanceInfo id=1 result.version=$rpc_version"

    if [[ "$REQUIRE_READY" == "yes" ]]; then
        local deadline=$((SECONDS + WAIT_READY))
        local s sbody
        while true; do
            s=$(curl --silent --show-error --output "$WORKDIR/ready.json" --write-out '%{http_code}' --max-time 10 "$base/readyz" 2>/dev/null || echo 000)
            sbody=$(cat "$WORKDIR/ready.json")
            if [[ "$s" == "200" ]]; then
                json_get "$sbody" status | grep -qx 'ok' && break
            fi
            if [[ $SECONDS -ge $deadline ]]; then
                fail "/readyz did not reach ok within ${WAIT_READY}s (last HTTP $s)"
            fi
            sleep 3
        done
        local ok_info
        ok_info=$(curl --silent --show-error --output "$WORKDIR/info.json" --write-out '%{http_code}' --max-time 10 "$base/info")
        [[ "$ok_info" == "200" ]] || fail "/info not HTTP 200 once ready (got $ok_info)"
        json_get "$(cat "$WORKDIR/info.json")" status | grep -qx 'ok' || fail "/info status not ok once ready"
        pass "/readyz + /info reached status ok"
    fi
}

check_web() {
    local base="$1"

    local html
    curl --fail --silent --show-error --max-time 30 \
        --dump-header "$WORKDIR/web.headers" --output "$WORKDIR/web.html" "$base/" \
        || fail "frontend / curl failed"
    html=$(cat "$WORKDIR/web.html")
    grep -q '<title>FXRate-web</title>' <<<"$html" || fail "frontend / missing <title>FXRate-web</title>"
    grep -qi '^x-content-type-options: nosniff' "$WORKDIR/web.headers" || fail "frontend / missing nosniff header"
    grep -qi '^x-frame-options: DENY' "$WORKDIR/web.headers" || fail "frontend / missing frame denial header"
    grep -qi '^referrer-policy: strict-origin-when-cross-origin' "$WORKDIR/web.headers" || fail "frontend / missing referrer policy"
    grep -qi '^permissions-policy: camera=(), geolocation=(), microphone=()' "$WORKDIR/web.headers" || fail "frontend / missing permissions policy"
    grep -qi '^x-fx-release: .' "$WORKDIR/web.headers" || fail "frontend / missing release header"
    grep -qi '^x-fx-build-time: .' "$WORKDIR/web.headers" || fail "frontend / missing build-time header"
    pass "frontend / HTTP 200 with <title>FXRate-web</title>"
}

check_backend_meta() {
    local base="$1" expected_rpc="$2"
    local meta_body rpc_url rest_base expected_rest
    meta_body=$(curl --fail --silent --show-error --max-time 30 "$base/api/backend-meta") \
        || fail "/api/backend-meta curl failed"
    rpc_url=$(json_get "$meta_body" rpcUrl) || fail "/api/backend-meta rpcUrl missing: $meta_body"
    rest_base=$(json_get "$meta_body" restBase) || fail "/api/backend-meta restBase missing: $meta_body"
    expected_rest=${expected_rpc%/}
    expected_rest=${expected_rest%/v1/jsonrpc}
    [[ "$rpc_url" == "$expected_rpc" ]] \
        || fail "/api/backend-meta rpcUrl='$rpc_url' (expected '$expected_rpc')"
    [[ "$rest_base" == "$expected_rest" ]] \
        || fail "/api/backend-meta restBase='$rest_base' (expected '$expected_rest')"
    pass "/api/backend-meta matches build-time proxy $expected_rpc"
}

# 仅 Tier-2：浏览器代理 /api/fxrate 必须回指 FXRATE_PROXY 指定的后端——直接证明
# build-arg 在构建期被固化进 standalone rewrites。
check_proxy() {
    local base="$1"

    local proxy_code proxy_body
    proxy_code=$(curl --silent --show-error --output "$WORKDIR/proxy.json" --write-out '%{http_code}' --max-time 30 \
        --header 'content-type: application/json' \
        --data '{"jsonrpc":"2.0","id":1,"method":"instanceInfo","params":{}}' \
        "$base/api/fxrate")
    proxy_body=$(cat "$WORKDIR/proxy.json")
    [[ "$proxy_code" == "200" ]] || fail "/api/fxrate proxy returned HTTP $proxy_code (FXRATE_PROXY wiring broken)"
    local proxy_version
    proxy_version=$(json_get "$proxy_body" result.version) || fail "/api/fxrate proxy result.version missing: $proxy_body"
    [[ -n "$proxy_version" ]] || fail "/api/fxrate proxy result.version empty"
    pass "/api/fxrate proxy -> JSON-RPC result.version=$proxy_version"
}

check_port_free() {
    local port="$1"
    if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
        exec 3>&- || true
        fail "port $port already in use — pass --backend-port/--web-port"
    fi
}

cd "$(dirname "$0")/.."

if [[ "$MODE" == "exact" ]]; then
    # Tier-1：精确发布镜像，只验证启动 + 运行时核心输出（确定性，不碰后端/代理）。
    docker rm -f "$WEB_CONTAINER" >/dev/null 2>&1 || true
    docker run --detach --name "$WEB_CONTAINER" \
        --publish "127.0.0.1:${WEB_PORT}:3000" "$WEB_IMAGE"
    wait_http "http://127.0.0.1:${WEB_PORT}/" 60
    check_web "http://127.0.0.1:${WEB_PORT}"
    check_backend_meta "http://127.0.0.1:${WEB_PORT}" "$EXPECTED_PROXY"
elif [[ "$MODE" == "contract" ]]; then
    docker network create "$NETWORK" 2>/dev/null || true
    docker rm -f "$BACKEND_CONTAINER" "$WEB_CONTAINER" >/dev/null 2>&1 || true

    docker build --tag "$BACKEND_IMAGE" lib/fxrate
	# 自动 smoke 设置 FXRATE_DISABLE_REFRESH=1，确保零真实上游；显式
	# --require-ready 仅供人工扩展检查，此时启用 60s 刷新周期并等待真实数据。
	REFRESH_ENV=()
	if [[ "$REQUIRE_READY" == "yes" ]]; then
		REFRESH_ENV+=(--env FXRATE_REFRESH_INTERVAL_MS=60000)
	else
		REFRESH_ENV+=(--env FXRATE_DISABLE_REFRESH=1)
	fi
	docker run --detach --name "$BACKEND_CONTAINER" --network "$NETWORK" \
		--publish "127.0.0.1:${BACKEND_PORT}:8080" \
		--env PORT=8080 "${REFRESH_ENV[@]}" "$BACKEND_IMAGE"
    wait_http "http://127.0.0.1:${BACKEND_PORT}/info" 60

    docker build --build-arg "FXRATE_PROXY=http://${BACKEND_CONTAINER}:8080/v1/jsonrpc" \
        --build-arg "FXBUILD_ID=contract-smoke" \
        --build-arg "FXBUILD_TIME=1970-01-01T00:00:00Z" \
        --tag "$WEB_IMAGE" .
    docker run --detach --name "$WEB_CONTAINER" --network "$NETWORK" \
        --publish "127.0.0.1:${WEB_PORT}:3000" \
        --env "FXRATE_API=http://${BACKEND_CONTAINER}:8080/v1/jsonrpc" \
        "$WEB_IMAGE"
    wait_http "http://127.0.0.1:${WEB_PORT}/" 60

    check_backend "http://127.0.0.1:${BACKEND_PORT}"
    check_web "http://127.0.0.1:${WEB_PORT}"
    check_backend_meta "http://127.0.0.1:${WEB_PORT}" "http://${BACKEND_CONTAINER}:8080/v1/jsonrpc"
    check_proxy "http://127.0.0.1:${WEB_PORT}"
else
    [[ -f lib/fxrate/dist/index.cjs ]] || fail "lib/fxrate/dist/index.cjs missing — run 'yarn build' in lib/fxrate first"
    check_port_free "$BACKEND_PORT"
	check_port_free "$WEB_PORT"

	LOCAL_PIDS=()
	LOCAL_REFRESH_ENV="FXRATE_DISABLE_REFRESH=1"
	if [[ "$REQUIRE_READY" == "yes" ]]; then
		LOCAL_REFRESH_ENV="FXRATE_REFRESH_INTERVAL_MS=60000"
	fi
	spawn_local \
		"cd '$PWD/lib/fxrate' && exec env PORT='$BACKEND_PORT' $LOCAL_REFRESH_ENV node dist/index.cjs" \
        "$WORKDIR/backend.log"
    wait_http "http://127.0.0.1:${BACKEND_PORT}/info" 60

    spawn_local \
        "cd '$PWD' && exec env FXBUILD_ID='local-smoke' FXBUILD_TIME='1970-01-01T00:00:00Z' FXRATE_API='http://127.0.0.1:${BACKEND_PORT}/v1/jsonrpc' FXRATE_PROXY='http://127.0.0.1:${BACKEND_PORT}/v1/jsonrpc' yarn dev --port '$WEB_PORT'" \
        "$WORKDIR/web.log"
    # next dev 冷编译在负载高时可能很慢：等待窗口放宽到 300s（只在失败路径消耗）。
    wait_http "http://127.0.0.1:${WEB_PORT}/" 300

    check_backend "http://127.0.0.1:${BACKEND_PORT}"
    check_web "http://127.0.0.1:${WEB_PORT}"
    check_backend_meta "http://127.0.0.1:${WEB_PORT}" "http://127.0.0.1:${BACKEND_PORT}/v1/jsonrpc"
    check_proxy "http://127.0.0.1:${WEB_PORT}"
fi

echo "OK: image smoke passed (mode=$MODE)."
