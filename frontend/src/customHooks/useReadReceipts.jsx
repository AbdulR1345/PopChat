import { useEffect, useRef } from 'react'
import { useDispatch } from 'react-redux'
import axios from 'axios'
import { serverUrl } from '../main'
import { updateMessageStatus } from '../redux/messageSlice'

function useReadReceipts({ selectedUserId, userId, messages, scrollRef }) {
  const dispatch = useDispatch()
  const requested = useRef(new Set())

  useEffect(() => {
    const root = scrollRef.current
    if (!root || !selectedUserId || !userId) return
    const unread = new Set(messages.filter(message =>
      message.receiptVersion === 1 && String(message.sender) === selectedUserId &&
      String(message.receiver) === userId && !message.readAt,
    ).map(message => String(message._id)))
    if (!unread.size) return
    let active = true
    let timer
    const queued = new Set()

    const flush = async () => {
      window.clearTimeout(timer)
      const ids = [...queued].slice(0, 100)
      for (const id of ids) queued.delete(id)
      if (!ids.length) return
      try {
        const result = await axios.post(`${serverUrl}/api/message/read/${selectedUserId}`,
          { messageIds: ids }, { withCredentials: true })
        if (active) for (const status of result.data.messages ?? []) {
          dispatch(updateMessageStatus({ ...status, sender: selectedUserId, receiver: userId }))
        }
      } catch {
        for (const id of ids) requested.current.delete(id)
        if (active) window.setTimeout(checkVisible, 1000)
      } finally {
        if (active && queued.size) timer = window.setTimeout(flush, 100)
      }
    }
    const queue = id => {
      if (!unread.has(id) || requested.current.has(id)) return
      requested.current.add(id)
      queued.add(id)
      window.clearTimeout(timer)
      timer = window.setTimeout(flush, 100)
    }
    const canRead = () => document.visibilityState === 'visible' && document.hasFocus()
    const checkVisible = () => {
      if (!active || !canRead()) return
      const bounds = root.getBoundingClientRect()
      for (const item of root.querySelectorAll('.message-row.incoming[data-message-id]')) {
        const rect = item.getBoundingClientRect()
        if (Math.min(bounds.bottom, rect.bottom) - Math.max(bounds.top, rect.top) >= Math.min(rect.height / 2, bounds.height / 2)) {
          queue(item.dataset.messageId)
        }
      }
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null :
      new IntersectionObserver(entries => {
        if (!active || !canRead()) return
        for (const entry of entries) if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          queue(entry.target.dataset.messageId)
        }
      }, { root, threshold: 0.5 })
    for (const item of root.querySelectorAll('.message-row.incoming[data-message-id]')) {
      if (unread.has(item.dataset.messageId)) observer?.observe(item)
    }
    window.addEventListener('focus', checkVisible)
    document.addEventListener('visibilitychange', checkVisible)
    root.addEventListener('scroll', checkVisible, { passive: true })
    checkVisible()
    return () => {
      active = false
      observer?.disconnect()
      window.removeEventListener('focus', checkVisible)
      document.removeEventListener('visibilitychange', checkVisible)
      root.removeEventListener('scroll', checkVisible)
      if (queued.size) void flush()
      else window.clearTimeout(timer)
    }
  }, [dispatch, messages, scrollRef, selectedUserId, userId])
}

export default useReadReceipts
