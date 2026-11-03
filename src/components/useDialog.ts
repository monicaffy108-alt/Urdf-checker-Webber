import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button, textarea, input:not([type=hidden]), select, [tabindex]'

/**
 * 弹层（抽屉、对话框）的键盘行为：
 * 打开时把焦点放进去；Tab / Shift+Tab 只在弹层里循环，不会跑到背后的页面；Esc 关闭；
 * 关闭后焦点回到打开它的那个元素，用键盘的人不会丢掉自己在哪。
 */
export function useDialog(root: RefObject<HTMLElement | null>, onClose: () => void, initial?: RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = initial?.current ?? root.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    // 真正能用 Tab 走到的元素：不是 tabindex=-1、没禁用、看得见
    const tabbable = () => [...(root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = tabbable()
      if (!items.length) {
        e.preventDefault()
        return
      }
      const a = document.activeElement
      const inside = !!root.current && root.current.contains(a)
      if (e.shiftKey && (!inside || a === items[0])) {
        e.preventDefault()
        items[items.length - 1].focus()
      } else if (!e.shiftKey && (!inside || a === items[items.length - 1])) {
        e.preventDefault()
        items[0].focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      opener?.focus()
    }
  }, [root, initial])
}
