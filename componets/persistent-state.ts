"use client"
import * as React from "react"

type Parser<T> = (value: string | null) => T

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
	return raw == null ? defaultValue : parse(raw)
}
