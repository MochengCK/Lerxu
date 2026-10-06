import Icon from '@/components/Icons/Icon'

// 录制图标（⏺）：外圈 + 实心圆心。直播录制任务卡片用它标记"当前状态"
// （录制中为红色，其余状态随文字色，见 TaskProgressInfo.vue）。
Icon.register({
  'record': {
    'width': 24,
    'height': 24,
    'raw': `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none"/>
    </g>`
  }
})
