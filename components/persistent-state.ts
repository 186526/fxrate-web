"use client"
import * as React from "react"

type Parser<T> = (value: string | null) => T

// 挂载标记用：服务端快照 false、客户端 true，无需订阅
const neverSubscribe = () => () => {}

const listeners = new Map<string, Set<() => void>>()
const snapshots = new Map<string, string | null>()

const notify = (key: string) => {
	for (const listener of listeners.get(key) ?? []) listener()
}

const subscribe = (key: string, listener: () => void) => {
	let set = listeners.get(key)
	if (!set) {
		set = new Set()
		listeners.set(key, set)
	}
	set.add(listener)
	readRaw(key)
	queueMicrotask(() => notify(key))
	return () => {
		set?.delete(listener)
		if (set?.size == 0) listeners.delete(key)
	}
}

const readRaw = (key: string): string | null => {
	try {
		const value = localStorage.getItem(key)
		snapshots.set(key, value)
		return value
	} catch {
		return null
	}
}

export function usePersistentState<T>(
	key: string,
	defaultValue: T,
	parse: Parser<T>,
	serialize: (value: T) => string,
) {
	const getSnapshot = React.useCallback(() => readRaw(key), [key])
	const raw = React.useSyncExternalStore(
		(listener) => subscribe(key, listener),
		getSnapshot,
		() => null,
	)
	const value = React.useMemo(
		() => (raw == null ? defaultValue : parse(raw)),
		[raw, defaultValue, parse],
	)
	React.useEffect(() => {
		if (raw == null) return
		try {
			localStorage.setItem(key, serialize(value))
		} catch {
			// localStorage 不可用时保持内存快照
		}
	}, [key, raw, serialize, value])
	const setValue = React.useCallback(
		(next: T | ((current: T) => T)) => {
			const current = raw == null ? defaultValue : parse(raw)
			const resolved = typeof next == "function"
				? (next as (current: T) => T)(current)
				: next
			try {
				localStorage.setItem(key, serialize(resolved))
			} catch {
				return
			}
			notify(key)
		},
		[key, raw, defaultValue, parse, serialize],
	)
	const reset = React.useCallback(() => {
		try {
			localStorage.removeItem(key)
		} catch {
			return
		}
		notify(key)
	}, [key])
	return [value, setValue, reset] as const
}

// 读取 localStorage 中的持久化值。hydrated=false 表示服务端快照或客户端首次
// 渲染（useSyncExternalStore 尚未读取存储），此时返回 defaultValue；调用方必须
// 等 hydrated 为 true 后再把值写回存储，否则首挂载会用默认值覆盖用户设置。
export function useHydratedStorage<T>(
	key: string,
	defaultValue: T,
	parse: Parser<T>,
) {
	const getClientSnapshot = React.useCallback(() => readRaw(key), [key])
	const raw = React.useSyncExternalStore(
		(listener) => subscribe(key, listener),
		getClientSnapshot,
		() => null,
	)
	// 挂载后才允许写回：仅凭 raw 是否为 null 无法区分「还没读」与「没有存值」，
	// 首挂载写回会用默认值覆盖用户设置。服务端快照 false、客户端 true。
	const hydrated = React.useSyncExternalStore(
		neverSubscribe,
		() => true,
		() => false,
	)
	return {
		value: raw == null ? defaultValue : parse(raw),
		hydrated,
	}
}
