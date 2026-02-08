// LinkCore 下载器 User-Agent 配置
// 区分 HTTP 下载和 BT 下载的标识

// BT 下载 User-Agent
// 用于 Tracker HTTP 请求和 DHT 网络
export const LINKCORE_BT_UA = 'FluxCore/1.0.2'

// Peer ID 前缀: 遵循 BT 协议 20 字节规范
// 格式: -FXxxxx- (8字节前缀 + 12字节随机数)
// FX = FluXcore, 1020 = 版本 1.0.2
export const LINKCORE_PEER_ID_PREFIX = '-FX1020-'

// BT 客户端名称: 用于 BEP 10 扩展握手
export const LINKCORE_CLIENT_NAME = 'FluxCore (based on aria2)'

// HTTP 下载默认 User-Agent（Chrome 浏览器）
// 用户可以在偏好设置中自定义
export const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// 其他可选 UA（用于特定场景）
export const ARIA2_UA = 'aria2/1.37.0'
export const TRANSMISSION_UA = 'Transmission/3.00'
export const DU_UA = 'netdisk;6.0.0.12;PC;PC-Windows;10.0.16299;WindowsBaiduYunGuanJia'

// 默认导出（向后兼容）
export const LINKCORE_UA = LINKCORE_BT_UA

export default {
  linkcore: LINKCORE_BT_UA,
  aria2: ARIA2_UA,
  transmission: TRANSMISSION_UA,
  chrome: CHROME_UA,
  du: DU_UA
}
