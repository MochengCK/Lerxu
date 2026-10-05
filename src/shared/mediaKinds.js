/**
 * "这个文件能不能播、算视频还是音频" —— **主进程与渲染进程共用这一份判断**。
 *
 * 为什么放 shared：三处都要用同一个结论 —— 文件表格决定要不要显示播放按钮、
 * 主进程决定放不放行、播放器窗口决定用视频还是音频布局。各写一份必然漂移
 * （添加一个扩展名只改了两处，用户就会遇到"有按钮但打不开"）。
 */
export const VIDEO_EXTENSIONS = [
  'mp4', 'm4v', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv', 'ts', 'm2ts',
  // 注意：`m4s`（DASH 媒体分片）**不在这里**。单看一条分片没有索引
  // （`moov` 在初始化段里），任何播放器都放不了它 —— 给它播放按钮只会让用户
  // 撞上"播不了"。要支持就得让宿主把初始化段与分片一起交给引擎，那是另一件事。
  'mpg', 'mpeg', 'rmvb', '3gp', 'ogv', 'vob', 'asf'
]

export const AUDIO_EXTENSIONS = [
  'mp3', 'flac', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'wma', 'ape',
  'aiff', 'aif', 'alac', 'm4b', 'dsf', 'dff'
]

/** 扩展名 → `'video'` | `'audio'` | `''`（空串表示不提供播放）。 */
export function mediaKindOf (filePath) {
  const m = `${filePath || ''}`.match(/\.([a-z0-9]+)$/i)
  const ext = m ? m[1].toLowerCase() : ''
  if (VIDEO_EXTENSIONS.includes(ext)) {
    return 'video'
  }
  if (AUDIO_EXTENSIONS.includes(ext)) {
    return 'audio'
  }
  return ''
}

/** 能不能播（表格里决定是否显示播放按钮用的就是它）。 */
export function isPlayableMedia (filePath) {
  return mediaKindOf(filePath) !== ''
}
