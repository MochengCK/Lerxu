import { openSync, readSync, closeSync } from 'node:fs'

/**
 * 边下边播的"等数据"判据：媒体引擎报"读不出容器"时，宿主怎么判断
 * **是数据还没到**（该等）而不是文件真的坏了。
 *
 * ## 为什么需要判据
 *
 * 下载引擎先**扩文件**、后填数据，还没下到的位置读出来是零。媒体引擎读到
 * 一片零就报"无法识别的容器"——对 BT 文件那是"数据还在路上"，不是失败。
 * 但也不能无脑重试：每次重试都要起一个引擎进程、让播放器闪一下"正在打开…"，
 * 而结果必然还是同一个错误。所以先看一眼开头有没有数据，有才值得试。
 *
 * 判据是"前 32 字节里有非零字节"：够粗暴，但正是"容器头到没到"的可靠代理 ——
 * 真实容器的开头（MP4 的 `ftyp`、TS 的 `0x47`）不可能全是零。
 */

/** 等数据的窗口：优先下载只是把开头的片**提到最前**，还得从 peer 那里下回来。 */
export const STREAM_WAIT_MS = 2 * 60 * 1000

/** 等待期间"开头到了没"的查看间隔。 */
export const STREAM_POLL_MS = 3000

/** 一次播放里最多重开几次引擎流（防止"重开→立刻失败"无限循环）。 */
export const STREAM_MAX_ATTEMPTS = 5

/** 判据要看多少字节（够任何一个容器露头）。 */
const HEAD_PROBE_BYTES = 32

/**
 * 文件开头是否已经有数据。
 *
 * 读不到（文件还不存在）→ false：那是"还没建文件"，同样属于"数据没到"。
 */
export function hasFileHead (filePath) {
  let fd = null
  try {
    fd = openSync(filePath, 'r')
    const buf = Buffer.allocUnsafe(HEAD_PROBE_BYTES)
    const got = readSync(fd, buf, 0, buf.length, 0)
    for (let i = 0; i < got; i++) {
      if (buf[i] !== 0) {
        return true
      }
    }
    return false
  } catch (_) {
    return false
  } finally {
    if (fd !== null) {
      try { closeSync(fd) } catch (_) {}
    }
  }
}
