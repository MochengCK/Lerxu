// LinkCore downloader User-Agent config.
// Split identifiers for HTTP and BT traffic.

// BT User-Agent used for tracker HTTP and DHT related identity.
// Must match the XferCore engine version in XferCore/configure.ac (AC_INIT).
export const LINKCORE_BT_UA = 'XferCore/1.6.1'

// Peer ID prefix: 20-byte BT peer id format, "-XCxxxx-" + 12 random chars.
// Azureus-style: -XC{major}{minor}{micro}0- (e.g. -XC1610- = XferCore 1.6.1).
// Must match LINKCORE_BT_UA version and XferCore/configure.ac.
export const LINKCORE_PEER_ID_PREFIX = '-XC1610-'

// BT client name used in BEP10 extension handshake.
export const LINKCORE_CLIENT_NAME = 'XferCore (based on aria2)'

// Default HTTP User-Agent (browser style), user can override in preferences.
export const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Other optional UA values.
export const ARIA2_UA = 'aria2/1.37.0'
export const TRANSMISSION_UA = 'Transmission/3.00'
export const DU_UA = 'netdisk;6.0.0.12;PC;PC-Windows;10.0.16299;WindowsBaiduYunGuanJia'

// Backward compatible export.
export const LINKCORE_UA = LINKCORE_BT_UA

export default {
  aria2: ARIA2_UA,
  transmission: TRANSMISSION_UA,
  chrome: CHROME_UA,
  du: DU_UA
}
