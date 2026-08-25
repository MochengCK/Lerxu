<template>
  <div class="mo-task-peers">
    <div class="mo-best-peer" v-if="bestPeer">
      <div class="best-peer-label">{{ t('task.best-peer') }}</div>
      <div class="best-peer-info">
        <div class="best-peer-item">
          <span class="best-peer-key">{{ t('task.task-peer-host') }}:</span>
          <span class="best-peer-value">{{ bestPeer.ip }}:{{ bestPeer.port }}</span>
        </div>
        <div class="best-peer-item">
          <span class="best-peer-key">{{ t('task.task-peer-location') }}:</span>
          <span class="best-peer-value">
            <span
              v-if="getPeerCountryCode(bestPeer.ip)"
              :class="getPeerCountryClass(bestPeer.ip)"
            ></span>
            {{ getPeerLocation(bestPeer.ip) }}
          </span>
        </div>
        <div class="best-peer-item">
          <span class="best-peer-key">{{ t('task.task-peer-client') }}:</span>
          <span class="best-peer-value">{{ renderPeerClient(bestPeer) }}</span>
        </div>
        <div class="best-peer-item">
          <span class="best-peer-key">{{ t('task.task-peer-progress') }}:</span>
          <span class="best-peer-value">{{ bitfieldToPercent(bestPeer.bitfield) }}%</span>
        </div>
        <div class="best-peer-item">
          <span class="best-peer-key">{{ t('task.task-peer-upload-speed') }}:</span>
          <span class="best-peer-value">{{ bytesToSize(bestPeer.uploadSpeed) }}/s</span>
        </div>
        <div class="best-peer-item">
          <span class="best-peer-key">{{ t('task.task-peer-download-speed') }}:</span>
          <span class="best-peer-value">{{ bytesToSize(bestPeer.downloadSpeed) }}/s</span>
        </div>
      </div>
    </div>
    <div class="mo-table-wrapper" ref="tableWrapper" @contextmenu.prevent="handleTableContextMenu">
      <el-table
        ref="peerTable"
        class="mo-peer-table"
        size="small"
        :data="groupedPeers"
        :height="tableHeight"
        row-key="id"
        :expand-row-keys="expandedGroupKeys"
        :tree-props="{children: 'children', hasChildren: 'hasChildren'}"
        :span-method="handleSpanMethod"
        :row-class-name="rowClassNameFn"
        @sort-change="handleSortChange"
        @expand-change="handleExpandChange"
        @row-click="handleRowClick"
        @row-contextmenu="handleRowContextMenu"
      >
        <el-table-column
          :label="t('task.task-peer-host')"
          prop="ip"
          sortable="custom"
          min-width="140">
          <template #default="scope">
            <template v-if="scope.row.isGroup">
              <span class="mo-peer-group-label">{{ scope.row.groupLabel }}</span>
            </template>
            <template v-else>
              <!-- 所有peer都显示IP:Port格式，保持一致 -->
              <mo-hover-tip effect="dark" :content="`${scope.row.ip}:${scope.row.port}`" placement="top" :open-delay="0">
                <span class="mo-peer-text">{{ `${scope.row.ip}:${scope.row.port}` }}</span>
              </mo-hover-tip>
            </template>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-peer-location')"
          prop="ip"
          sortable="custom"
          min-width="100">
          <template #default="scope">
            <mo-hover-tip effect="dark" :content="getPeerLocation(scope.row.ip)" placement="top" :open-delay="0">
              <span class="mo-peer-location">
                <span
                  v-if="getPeerCountryCode(scope.row.ip)"
                  :class="getPeerCountryClass(scope.row.ip)"
                ></span>
                <span class="mo-peer-text">{{ getPeerLocation(scope.row.ip) }}</span>
              </span>
            </mo-hover-tip>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-peer-client')"
          prop="peerId"
          sortable="custom"
          min-width="125">
          <template #default="scope">
            <mo-hover-tip effect="dark" :content="getPeerClientTooltip(scope.row)" placement="top" :open-delay="0">
              <span class="mo-peer-text">{{ renderPeerClient(scope.row) }}</span>
            </mo-hover-tip>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-peer-connection-time')"
          prop="connectionTime"
          sortable="custom"
          min-width="120">
          <template #default="scope">
            <template v-if="scope.row.status === 'banned'">
              <span style="color: #f56c6c;">{{ formatDuration(scope.row.remainingTime) }}</span>
            </template>
            <template v-else-if="scope.row.status === 'attempting'">
              <span style="color: #909399;">{{ t('task.peer-status-attempting') }}</span>
            </template>
            <template v-else-if="scope.row.status === 'disconnected'">
              -
            </template>
            <template v-else>
              {{ formatDuration(scope.row.connectionTime) || '-' }}
            </template>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-peer-status')"
          prop="status"
          sortable="custom"
          min-width="120">
          <template #default="scope">
            <template v-if="scope.row.isGroup">
              -
            </template>
            <template v-else-if="scope.row.status === 'disconnected'">
              <mo-hover-tip effect="dark" :content="getPeerFailureDetailText(scope.row)" placement="top" :open-delay="0">
                <span class="mo-peer-text">{{ getPeerFailureSummaryText(scope.row) }}</span>
              </mo-hover-tip>
            </template>
            <template v-else>
              {{ getPeerStatus(scope.row) }}
            </template>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-peer-protocol')"
          prop="protocol"
          sortable="custom"
          width="110">
          <template #default="scope">
            {{ getPeerProtocol(scope.row) }}
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-peer-encryption')"
          prop="encrypted"
          sortable="custom"
          width="90">
          <template #default="scope">
            <template v-if="scope.row.isGroup">
              -
            </template>
            <template v-else>
              {{ getPeerEncryption(scope.row) }}
            </template>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-peer-source')"
          prop="source"
          sortable="custom"
          width="90">
          <template #default="scope">
            {{ getPeerSource(scope.row) }}
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-peer-downloaded')"
          prop="downloadLength"
          sortable="custom"
          align="right"
          width="110">
          <template #default="scope">
            {{ bytesToSize(scope.row.downloadLength) }}
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-peer-progress')"
          prop="bitfield"
          sortable="custom"
          align="right"
          width="90">
          <template #default="scope">
            {{ bitfieldToPercent(scope.row.bitfield, true) }}%
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-peer-upload-speed')"
          prop="uploadSpeed"
          sortable="custom"
          align="right"
          width="110">
          <template #default="scope">
            {{ bytesToSize(scope.row.uploadSpeed) }}/s
          </template>
        </el-table-column>
        <el-table-column
          :label="t('task.task-peer-download-speed')"
          prop="downloadSpeed"
          sortable="custom"
          align="right"
          width="110">
          <template #default="scope">
            {{ bytesToSize(scope.row.downloadSpeed) }}/s
          </template>
        </el-table-column>
      </el-table>
    </div>
    <!-- 右键菜单 -->
    <div
      v-show="contextMenuVisible"
      class="mo-peer-context-menu"
      :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
    >
      <template v-if="contextMenuType === 'blank'">
        <div class="context-menu-item" @click="resetPeerGroupVisibility">
          <el-icon><Refresh /></el-icon>
          {{ t('task.peers-group-show-all') }}
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="togglePeerGroupVisibility('connected')">
          <el-icon :style="{ opacity: peerGroupVisibility.connected ? 1 : 0 }"><Check /></el-icon>
          {{ t('task.peers-group-connected') }}
        </div>
        <div class="context-menu-item" @click="togglePeerGroupVisibility('attempting')">
          <el-icon :style="{ opacity: peerGroupVisibility.attempting ? 1 : 0 }"><Check /></el-icon>
          {{ t('task.peers-group-attempting') }}
        </div>
        <div class="context-menu-item" @click="togglePeerGroupVisibility('banned')">
          <el-icon :style="{ opacity: peerGroupVisibility.banned ? 1 : 0 }"><Check /></el-icon>
          {{ t('task.peers-group-banned') }}
        </div>
        <div class="context-menu-item" @click="togglePeerGroupVisibility('disconnected')">
          <el-icon :style="{ opacity: peerGroupVisibility.disconnected ? 1 : 0 }"><Check /></el-icon>
          {{ t('task.peers-group-disconnected') }}
        </div>
      </template>
      <template v-else-if="contextMenuPeer && contextMenuPeer.status === 'banned'">
        <div class="context-menu-item" @click="banPeer(300)">
          <el-icon><CirclePlus /></el-icon>
          {{ t('task.extend-ban-5min') }}
        </div>
        <div class="context-menu-item" @click="banPeer(3600)">
          <el-icon><CirclePlus /></el-icon>
          {{ t('task.extend-ban-1hour') }}
        </div>
        <div class="context-menu-item" @click="banPeer(86400)">
          <el-icon><CirclePlus /></el-icon>
          {{ t('task.extend-ban-1day') }}
        </div>
        <div class="context-menu-item" @click="banPeer(-1)">
          <el-icon><CirclePlus /></el-icon>
          {{ t('task.extend-ban-forever') }}
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="unbanPeer">
          <el-icon><CircleCheckFilled /></el-icon>
          {{ t('task.unban-peer') }}
        </div>
      </template>
      <template v-else>
        <div class="context-menu-item" @click="banPeer(300)">
          <el-icon><CircleCloseFilled /></el-icon>
          {{ t('task.ban-peer-5min') }}
        </div>
        <div class="context-menu-item" @click="banPeer(3600)">
          <el-icon><CircleCloseFilled /></el-icon>
          {{ t('task.ban-peer-1hour') }}
        </div>
        <div class="context-menu-item" @click="banPeer(86400)">
          <el-icon><CircleCloseFilled /></el-icon>
          {{ t('task.ban-peer-1day') }}
        </div>
        <div class="context-menu-item" @click="banPeer(-1)">
          <el-icon><CircleCloseFilled /></el-icon>
          {{ t('task.ban-peer-forever') }}
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import {
  bitfieldToPercent,
  bytesToSize,
  peerIdParser,
  timeFormat
} from '@shared/utils'
import { searchInfoSync } from '@shared/utils/ip2region'
import { ElMessage, ElMessageBox } from 'element-plus'
import i18n from '@/plugins/i18n'
import { usePreferenceStore } from '@/store/preference'
import { useTaskStore } from '@/store/task'
import { storeToRefs } from 'pinia'
import { createMsg } from '@/components/Msg'
import 'flag-icons/css/flag-icons.min.css'

const { t } = i18n.global

const msg = createMsg(ElMessage, { showClose: true })

// Module-level country name -> ISO code map (built once, not per call).
const COUNTRY_NAME_TO_CODE = {
    // 亚洲
    中国: 'CN',
    日本: 'JP',
    韩国: 'KR',
    印度: 'IN',
    新加坡: 'SG',
    泰国: 'TH',
    马来西亚: 'MY',
    马拉雅: 'MY',
    印度尼西亚: 'ID',
    菲律宾: 'PH',
    越南: 'VN',
    香港: 'HK',
    台湾: 'TW',
    澳门: 'MO',
    蒙古: 'MN',
    朝鲜: 'KP',
    缅甸: 'MM',
    老挝: 'LA',
    柬埔寨: 'KH',
    文莱: 'BN',
    东帝汶: 'TL',
    尼泊尔: 'NP',
    不丹: 'BT',
    孟加拉国: 'BD',
    斯里兰卡: 'LK',
    马尔代夫: 'MV',
    巴基斯坦: 'PK',
    阿富汗: 'AF',
    哈萨克斯坦: 'KZ',
    乌兹别克斯坦: 'UZ',
    土库曼斯坦: 'TM',
    吉尔吉斯斯坦: 'KG',
    塔吉克斯坦: 'TJ',
    // 欧洲
    英国: 'GB',
    'United Kingdom': 'GB',
    UK: 'GB',
    'Great Britain': 'GB',
    England: 'GB',
    Scotland: 'GB',
    Wales: 'GB',
    'Northern Ireland': 'GB',
    法国: 'FR',
    France: 'FR',
    德国: 'DE',
    Germany: 'DE',
    意大利: 'IT',
    Italy: 'IT',
    西班牙: 'ES',
    Spain: 'ES',
    荷兰: 'NL',
    Netherlands: 'NL',
    'The Netherlands': 'NL',
    Holland: 'NL',
    瑞士: 'CH',
    Switzerland: 'CH',
    瑞典: 'SE',
    Sweden: 'SE',
    波兰: 'PL',
    Poland: 'PL',
    比利时: 'BE',
    Belgium: 'BE',
    奥地利: 'AT',
    Austria: 'AT',
    挪威: 'NO',
    Norway: 'NO',
    丹麦: 'DK',
    Denmark: 'DK',
    芬兰: 'FI',
    Finland: 'FI',
    爱尔兰: 'IE',
    Ireland: 'IE',
    'Republic of Ireland': 'IE',
    葡萄牙: 'PT',
    Portugal: 'PT',
    希腊: 'GR',
    Greece: 'GR',
    捷克: 'CZ',
    'Czech Republic': 'CZ',
    Czechia: 'CZ',
    匈牙利: 'HU',
    Hungary: 'HU',
    罗马尼亚: 'RO',
    Romania: 'RO',
    乌克兰: 'UA',
    Ukraine: 'UA',
    俄罗斯: 'RU',
    Russia: 'RU',
    'Russian Federation': 'RU',
    白俄罗斯: 'BY',
    Belarus: 'BY',
    保加利亚: 'BG',
    Bulgaria: 'BG',
    塞尔维亚: 'RS',
    Serbia: 'RS',
    克罗地亚: 'HR',
    Croatia: 'HR',
    斯洛伐克: 'SK',
    Slovakia: 'SK',
    斯洛文尼亚: 'SI',
    Slovenia: 'SI',
    立陶宛: 'LT',
    Lithuania: 'LT',
    拉脱维亚: 'LV',
    Latvia: 'LV',
    爱沙尼亚: 'EE',
    Estonia: 'EE',
    冰岛: 'IS',
    Iceland: 'IS',
    卢森堡: 'LU',
    Luxembourg: 'LU',
    马耳他: 'MT',
    Malta: 'MT',
    摩纳哥: 'MC',
    Monaco: 'MC',
    列支敦士登: 'LI',
    Liechtenstein: 'LI',
    安道尔: 'AD',
    Andorra: 'AD',
    圣马力诺: 'SM',
    'San Marino': 'SM',
    梵蒂冈: 'VA',
    'Vatican City': 'VA',
    Cyprus: 'CY',
    塞浦路斯: 'CY',
    Moldova: 'MD',
    摩尔多瓦: 'MD',
    欧洲: 'EU',
    Europe: 'EU',
    欧盟: 'EU',
    欧洲联盟: 'EU',
    'European Union': 'EU',
    EU: 'EU',
    // 北美洲
    美国: 'US',
    加拿大: 'CA',
    安大略: 'CA',
    安大略省: 'CA',
    Ontario: 'CA',
    魁北克: 'CA',
    魁北克省: 'CA',
    Quebec: 'CA',
    不列颠哥伦比亚: 'CA',
    不列颠哥伦比亚省: 'CA',
    'British Columbia': 'CA',
    卑诗: 'CA',
    卑诗省: 'CA',
    Alberta: 'CA',
    阿尔伯塔: 'CA',
    阿尔伯塔省: 'CA',
    Manitoba: 'CA',
    马尼托巴: 'CA',
    马尼托巴省: 'CA',
    Saskatchewan: 'CA',
    萨斯喀彻温: 'CA',
    萨斯喀彻温省: 'CA',
    'Nova Scotia': 'CA',
    新斯科舍: 'CA',
    新斯科舍省: 'CA',
    'New Brunswick': 'CA',
    新不伦瑞克: 'CA',
    新不伦瑞克省: 'CA',
    'Newfoundland and Labrador': 'CA',
    纽芬兰与拉布拉多: 'CA',
    纽芬兰与拉布拉多省: 'CA',
    'Prince Edward Island': 'CA',
    爱德华王子岛: 'CA',
    爱德华王子岛省: 'CA',
    Yukon: 'CA',
    育空: 'CA',
    'Northwest Territories': 'CA',
    西北地区: 'CA',
    Nunavut: 'CA',
    努纳武特: 'CA',
    墨西哥: 'MX',
    古巴: 'CU',
    牙买加: 'JM',
    海地: 'HT',
    多米尼加: 'DO',
    巴拿马: 'PA',
    哥斯达黎加: 'CR',
    危地马拉: 'GT',
    洪都拉斯: 'HN',
    尼加拉瓜: 'NI',
    萨尔瓦多: 'SV',
    伯利兹: 'BZ',
    // 南美洲
    巴西: 'BR',
    阿根廷: 'AR',
    智利: 'CL',
    秘鲁: 'PE',
    哥伦比亚: 'CO',
    委内瑞拉: 'VE',
    厄瓜多尔: 'EC',
    玻利维亚: 'BO',
    巴拉圭: 'PY',
    乌拉圭: 'UY',
    圭亚那: 'GY',
    苏里南: 'SR',
    // 大洋洲
    澳大利亚: 'AU',
    新西兰: 'NZ',
    斐济: 'FJ',
    巴布亚新几内亚: 'PG',
    所罗门群岛: 'SB',
    瓦努阿图: 'VU',
    萨摩亚: 'WS',
    汤加: 'TO',
    // 非洲
    南非: 'ZA',
    'South Africa': 'ZA',
    埃及: 'EG',
    Egypt: 'EG',
    尼日利亚: 'NG',
    Nigeria: 'NG',
    肯尼亚: 'KE',
    Kenya: 'KE',
    埃塞俄比亚: 'ET',
    Ethiopia: 'ET',
    加纳: 'GH',
    Ghana: 'GH',
    坦桑尼亚: 'TZ',
    Tanzania: 'TZ',
    乌干达: 'UG',
    Uganda: 'UG',
    阿尔及利亚: 'DZ',
    Algeria: 'DZ',
    摩洛哥: 'MA',
    Morocco: 'MA',
    突尼斯: 'TN',
    Tunisia: 'TN',
    利比亚: 'LY',
    Libya: 'LY',
    苏丹: 'SD',
    Sudan: 'SD',
    索马里: 'SO',
    Somalia: 'SO',
    津巴布韦: 'ZW',
    Zimbabwe: 'ZW',
    赞比亚: 'ZM',
    Zambia: 'ZM',
    莫桑比克: 'MZ',
    Mozambique: 'MZ',
    博茨瓦纳: 'BW',
    Botswana: 'BW',
    纳米比亚: 'NA',
    Namibia: 'NA',
    安哥拉: 'AO',
    Angola: 'AO',
    喀麦隆: 'CM',
    Cameroon: 'CM',
    塞内加尔: 'SN',
    Senegal: 'SN',
    科特迪瓦: 'CI',
    'Côte d’Ivoire': 'CI',
    "Côte d'Ivoire": 'CI',
    "Cote d'Ivoire": 'CI',
    'Cote d Ivoire': 'CI',
    'Ivory Coast': 'CI',
    马达加斯加: 'MG',
    Madagascar: 'MG',
    毛里求斯: 'MU',
    Mauritius: 'MU',
    // 中东
    土耳其: 'TR',
    以色列: 'IL',
    沙特阿拉伯: 'SA',
    阿联酋: 'AE',
    伊朗: 'IR',
    伊拉克: 'IQ',
    叙利亚: 'SY',
    约旦: 'JO',
    黎巴嫩: 'LB',
    科威特: 'KW',
    卡塔尔: 'QA',
    巴林: 'BH',
    阿曼: 'OM',
    也门: 'YE'
  }

const props = defineProps({
  peers: {
    type: [Object, Array],
    default: () => ({ connected: [], attempting: [], banned: [], disconnected: [] })
  },
  searchText: {
    type: String,
    default: () => ''
  },
  task: {
    type: Object,
    default: () => ({})
  }
})

defineOptions({ name: 'mo-task-peers' })

const preferenceStore = usePreferenceStore()
const taskStore = useTaskStore()
const { config: preferenceConfig } = storeToRefs(preferenceStore)

const filterMode = ref('all')
const search = ref('')
const sortProp = ref('downloadSpeed')
const sortOrder = ref('descending')
const tableHeight = ref('100%')
const expandedGroupKeys = ref(['group-connected'])
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuPeer = ref(null)
const attemptStats = ref({})
const disconnectedMap = ref({})
const lastAttemptingMap = ref({})
const lastConnectedMap = ref({})
const peerOrderMap = ref({})
const peerOrderSeed = ref(1)
const ipInfoCache = ref({})
const contextMenuType = ref('')
let contextMenuCloseHandler = null
let contextMenuTimer = null

const peerTable = ref(null)

const peerGroupVisibility = computed(() => {
  const config = preferenceConfig.value || {}
  const raw = config.peerGroupVisibility || {}
  return {
    connected: raw.connected !== false,
    attempting: raw.attempting !== false,
    banned: raw.banned !== false,
    disconnected: raw.disconnected !== false
  }
})

const rowClassNameFn = computed(() => {
  const cmVisible = contextMenuVisible.value
  const cmPeerId = contextMenuPeer.value ? contextMenuPeer.value.id : null
  return ({ row }) => {
    if (row.isGroup) {
      const groupId = row.id || ''
      const groupType = groupId.replace('group-', '')
      return `mo-peer-group-row mo-peer-group-${groupType}`
    }
    if (cmVisible && cmPeerId && row.id === cmPeerId) {
      return 'mo-peer-row-active'
    }
    return ''
  }
})

const bestPeer = computed(() => {
  let peers = props.peers || {}
  if (Array.isArray(peers)) {
    peers = { connected: peers }
  }
  const connected = Array.isArray(peers.connected) ? peers.connected : []
  if (connected.length === 0) return null
  return connected.reduce((best, current) => {
    const bestSpeed = Number(best.downloadSpeed) || 0
    const currentSpeed = Number(current.downloadSpeed) || 0
    return currentSpeed > bestSpeed ? current : best
  }, connected[0])
})

const countAll = computed(() => {
  const peers = props.peers || {}
  if (Array.isArray(peers)) return peers.length
  const connected = Array.isArray(peers.connected) ? peers.connected : []
  const attempting = Array.isArray(peers.attempting) ? peers.attempting : []
  const banned = Array.isArray(peers.banned) ? peers.banned : []
  const mergedDisconnected = getMergedDisconnectedPeers(peers)
  return connected.length + attempting.length + banned.length + mergedDisconnected.length
})

const groupedPeers = computed(() => {
        let peers = props.peers || {}

        // 兼容旧格式：如果peers是数组，转换为新格式
        if (Array.isArray(peers)) {
          peers = {
            connected: peers,
            attempting: [],
            banned: [],
            disconnected: []
          }
        }

        // 从新的数据结构中提取三种类型的节点
        const connected = Array.isArray(peers.connected) ? peers.connected : []
        const attempting = Array.isArray(peers.attempting) ? peers.attempting : []
        const banned = Array.isArray(peers.banned) ? peers.banned : []
        let disconnected = getMergedDisconnectedPeers(peers)

        // 限制“已断开”分类只显示最新100行
        disconnected.sort((a, b) => (b.lastDisconnectedAt || 0) - (a.lastDisconnectedAt || 0))
        if (disconnected.length > 100) {
          disconnected = disconnected.slice(0, 100)
        }

        const normalizeEngineStatus = (peer) => {
          if (!peer) return
          const status = `${peer.engineStatus || ''}`.toLowerCase()
          if (status === 'banned' || status === 'attempting' || status === 'downloading' || status === 'uploading' || status === 'seeding' || status === 'idle') {
            peer.engineStatus = status
            return
          }
          if (Object.prototype.hasOwnProperty.call(peer, 'engineStatus')) {
            peer.engineStatus = ''
          }
        }

        connected.forEach(p => {
          normalizeEngineStatus(p)
          p.status = 'connected'
        })
        attempting.forEach(p => {
          normalizeEngineStatus(p)
          p.status = 'attempting'
        })
        banned.forEach(p => {
          normalizeEngineStatus(p)
          p.status = 'banned'
        })
        disconnected.forEach(p => {
          normalizeEngineStatus(p)
          p.status = 'disconnected'
        })

        // 应用过滤和搜索 - 优化：减少重复计算
        const q = search.value.trim().toLowerCase()
        const hasSearch = q.length > 0

        const filterAndSearch = (peerList) => {
          if (!peerList || peerList.length === 0) return []

          return peerList.filter(p => {
            // 搜索过滤
            if (hasSearch) {
              const host = `${p.ip}:${p.port}`.toLowerCase()
              const client = peerIdParser(p.peerId || '').toLowerCase()
              if (!host.includes(q) && !client.includes(q)) {
                return false
              }
            }

            // 模式过滤（仅对已连接节点有效）
            if (p.status !== 'attempting' && p.status !== 'banned' && p.status !== 'disconnected') {
              const up = Number(p.uploadSpeed) || 0
              const down = Number(p.downloadSpeed) || 0
              const percent = bitfieldToPercent(p.bitfield)
              switch (filterMode.value) {
              case 'downloading':
                return down > 0
              case 'uploading':
                return up > 0 || percent >= 100
              case 'idle':
                return up === 0 && down === 0
              default:
                return true
              }
            }
            return true
          })
        }

        const allPeers = connected.concat(attempting, banned, disconnected)
        allPeers.forEach(p => ensurePeerOrder(p))

        const filteredConnected = filterAndSearch(connected)
        const filteredAttempting = filterAndSearch(attempting)
        const filteredBanned = filterAndSearch(banned)

        // 排序 - 优化：使用浅拷贝，减少条件判断
        const sortPeers = (peerList) => {
          if (!sortProp.value || peerList.length === 0) return peerList

          const sorted = peerList.slice() // 浅拷贝
          const prop = sortProp.value
          const isAsc = sortOrder.value === 'ascending'

          sorted.sort((a, b) => {
            let valA = a[prop]
            let valB = b[prop]
            const orderA = getPeerOrder(a)
            const orderB = getPeerOrder(b)

            if (prop === 'bitfield') {
              valA = bitfieldToPercent(valA)
              valB = bitfieldToPercent(valB)
            }

            if (prop === 'ip') {
              valA = getLocationFromIp(valA)
              valB = getLocationFromIp(valB)
              const compare = isAsc
                ? valA.localeCompare(valB, 'zh-CN')
                : valB.localeCompare(valA, 'zh-CN')
              return compare === 0 ? orderA - orderB : compare
            }

            if (prop === 'peerId') {
              const aUnknown = isPeerClientUnknown(a)
              const bUnknown = isPeerClientUnknown(b)
              if (!isAsc && aUnknown !== bUnknown) {
                return aUnknown ? 1 : -1
              }
              valA = renderPeerClient(a)
              valB = renderPeerClient(b)
              const compare = isAsc
                ? valA.localeCompare(valB, 'zh-CN')
                : valB.localeCompare(valA, 'zh-CN')
              return compare === 0 ? orderA - orderB : compare
            }

            if (prop === 'status') {
              const getText = (p) => {
                if (p.status === 'disconnected') return getPeerFailureSummaryText(p)
                return getPeerStatus(p)
              }
              valA = getText(a)
              valB = getText(b)
              const compare = isAsc
                ? valA.localeCompare(valB, 'zh-CN')
                : valB.localeCompare(valA, 'zh-CN')
              return compare === 0 ? orderA - orderB : compare
            }

            valA = Number(valA) || 0
            valB = Number(valB) || 0
            const compare = isAsc ? valA - valB : valB - valA
            return compare === 0 ? orderA - orderB : compare
          })

          return sorted
        }

        const sortedConnected = sortPeers(filteredConnected)
        const sortedAttempting = sortPeers(filteredAttempting)
        const filteredDisconnected = filterAndSearch(disconnected)
        const sortedBanned = sortPeers(filteredBanned)
        const sortedDisconnected = sortPeers(filteredDisconnected)

        // 构建分组结构 - 返回新对象，避免在 computed 中修改源 peer 对象
        const result = []
        if (sortedConnected.length > 0 && peerGroupVisibility.value.connected) {
          result.push({
            id: 'group-connected',
            isGroup: true,
            groupLabel: `${t('task.peers-connected')} (${sortedConnected.length})`,
            children: sortedConnected.map(p => ({
              ...p,
              status: 'connected',
              id: `${p.peerId}-${p.ip}:${p.port}`
            }))
          })
        }
        if (sortedDisconnected.length > 0 && peerGroupVisibility.value.disconnected) {
          result.push({
            id: 'group-disconnected',
            isGroup: true,
            groupLabel: `${t('task.peers-disconnected')} (${sortedDisconnected.length})`,
            children: sortedDisconnected.map(p => ({
              ...p,
              status: 'disconnected',
              id: `disconnected-${p.ip}:${p.port}`
            }))
          })
        }
        if (sortedAttempting.length > 0 && peerGroupVisibility.value.attempting) {
          result.push({
            id: 'group-attempting',
            isGroup: true,
            groupLabel: `${t('task.peers-attempting')} (${sortedAttempting.length})`,
            children: sortedAttempting.map(p => ({
              ...p,
              status: 'attempting',
              id: `attempting-${p.ip}:${p.port}`
            }))
          })
        }
        if (sortedBanned.length > 0 && peerGroupVisibility.value.banned) {
          result.push({
            id: 'group-banned',
            isGroup: true,
            groupLabel: `${t('task.peers-banned')} (${sortedBanned.length})`,
            children: sortedBanned.map(p => ({
              ...p,
              status: 'banned',
              id: `banned-${p.ip}`
            }))
          })
        }

        return result
      })

// Lifecycle
onBeforeUnmount(() => {
  if (contextMenuTimer) {
    clearTimeout(contextMenuTimer)
    contextMenuTimer = null
  }
  if (contextMenuCloseHandler) {
    document.removeEventListener('click', contextMenuCloseHandler)
    contextMenuCloseHandler = null
  }
})

// Watchers
watch(() => props.searchText, (value) => {
  search.value = value || ''
}, { immediate: true })

watch(() => props.peers, (peers) => {
  updateAttemptStats(peers)
}, { immediate: true })

// Methods
function normalizePeers (peers) {
  if (Array.isArray(peers)) {
    return { connected: peers, attempting: [], banned: [], disconnected: [] }
  }
  return {
    connected: Array.isArray(peers.connected) ? peers.connected : [],
    attempting: Array.isArray(peers.attempting) ? peers.attempting : [],
    banned: Array.isArray(peers.banned) ? peers.banned : [],
    disconnected: Array.isArray(peers.disconnected) ? peers.disconnected : []
  }
}

function peerKey (peer) {
  if (!peer) return ''
  const ip = peer.ip || ''
  const port = peer.port || ''
  return port ? `${ip}:${port}` : `${ip}`
}

function ensurePeerOrder (peer) {
  const key = peerKey(peer)
  if (!key) return
  if (!Object.prototype.hasOwnProperty.call(peerOrderMap.value, key)) {
    peerOrderMap.value[key] = peerOrderSeed.value
    peerOrderSeed.value += 1
  }
}

function getPeerOrder (peer) {
  const key = peerKey(peer)
  if (!key) return Number.MAX_SAFE_INTEGER
  return peerOrderMap.value[key] || Number.MAX_SAFE_INTEGER
}

function getMergedDisconnectedPeers (peers) {
  const normalized = normalizePeers(peers || {})
  const merged = {}
  normalized.disconnected.forEach(p => {
    const key = peerKey(p)
    if (key) {
      merged[key] = p
    }
  })
  Object.keys(disconnectedMap.value || {}).forEach(key => {
    if (!merged[key]) {
      merged[key] = disconnectedMap.value[key]
    }
  })
  return Object.values(merged)
}

function updateAttemptStats (peers) {
  const normalized = normalizePeers(peers || {})
  const currentAttemptingMap = {}
  const currentConnectedMap = {}

  normalized.attempting.forEach(p => {
    const key = peerKey(p)
    if (key) {
      currentAttemptingMap[key] = p
    }
  })

  normalized.connected.forEach(p => {
    const key = peerKey(p)
    if (key) {
      currentConnectedMap[key] = p
    }
  })

  Object.keys(currentAttemptingMap).forEach(key => {
    if (!lastAttemptingMap.value[key]) {
      const prev = attemptStats.value[key] || { attempts: 0, fails: 0, tcpFails: 0, utpFails: 0, udpFails: 0 }
      const next = { ...prev, attempts: prev.attempts + 1 }
      attemptStats.value[key] = next
    }
  })

  Object.keys(lastAttemptingMap.value).forEach(key => {
    if (!currentAttemptingMap[key] && !currentConnectedMap[key]) {
      const lastPeer = lastAttemptingMap.value[key]
      const prev = attemptStats.value[key] || { attempts: 0, fails: 0, tcpFails: 0, utpFails: 0, udpFails: 0 }
      const type = classifyFailType(lastPeer)
      const next = { ...prev, fails: prev.fails + 1 }
      if (type === 'utp') next.utpFails = (next.utpFails || 0) + 1
      else if (type === 'udp') next.udpFails = (next.udpFails || 0) + 1
      else next.tcpFails = (next.tcpFails || 0) + 1
      attemptStats.value[key] = next
      if (lastPeer) {
        disconnectedMap.value[key] = {
          ...lastPeer,
          status: 'disconnected',
          lastDisconnectedAt: Date.now()
        }
      }
    }
  })

  normalized.disconnected.forEach(p => {
    const key = peerKey(p)
    if (key) {
      disconnectedMap.value[key] = {
        ...p,
        status: 'disconnected',
        lastDisconnectedAt: Date.now()
      }
    }
  })

  Object.keys(currentConnectedMap).forEach(key => {
    if (disconnectedMap.value[key]) {
      delete disconnectedMap.value[key]
    }
  })

  lastAttemptingMap.value = currentAttemptingMap
  lastConnectedMap.value = currentConnectedMap
}

function classifyFailType (peer) {
  let errorText = ''
  if (peer) {
    errorText = `${peer.error || peer.errorMessage || peer.failureReason || peer.disconnectReason || peer.reason || ''}`.toLowerCase()
  }
  if (!peer) return 'tcp'
  if (peer.utp === true || peer.protocol === 'utp' || peer.protocol === 'UTP' || errorText.includes('utp')) {
    return 'utp'
  }
  if (peer.udpHolePunch === true || peer.udpHolePunching === true || peer.holePunch === true || peer.holePunching === true || peer.udpPunching === true || errorText.includes('punch') || errorText.includes('hole') || errorText.includes('udp')) {
    return 'udp'
  }
  return 'tcp'
}

function getPeerFailureCounts (peer) {
  if (peer) {
    const hasTcp = Object.prototype.hasOwnProperty.call(peer, 'tcpFails')
    const hasUtp = Object.prototype.hasOwnProperty.call(peer, 'utpFails')
    const hasUdp = Object.prototype.hasOwnProperty.call(peer, 'udpFails')
    if (hasTcp || hasUtp || hasUdp) {
      return {
        tcp: Number(peer.tcpFails) || 0,
        utp: Number(peer.utpFails) || 0,
        udp: Number(peer.udpFails) || 0
      }
    }
  }
  const key = peerKey(peer)
  if (!key) return { tcp: 0, utp: 0, udp: 0 }
  const stat = attemptStats.value[key] || {}
  return {
    tcp: Number(stat.tcpFails) || 0,
    utp: Number(stat.utpFails) || 0,
    udp: Number(stat.udpFails) || 0
  }
}

function getPeerFailureSummaryText (peer) {
  const { tcp, utp, udp } = getPeerFailureCounts(peer)
  const tcpLabel = t('task.peer-failure-short-tcp')
  const utpLabel = t('task.peer-failure-short-utp')
  const udpLabel = t('task.peer-failure-short-udp')
  const parts = []
  if (tcp > 0) parts.push(`${tcpLabel} ${tcp}`)
  if (utp > 0) parts.push(`${utpLabel} ${utp}`)
  if (udp > 0) parts.push(`${udpLabel} ${udp}`)
  return parts.length > 0 ? parts.join(' ') : `${tcpLabel} 0`
}

function getPeerFailureDetailText (peer) {
  const { tcp, utp, udp } = getPeerFailureCounts(peer)
  const parts = []
  if (tcp > 0) parts.push(`${t('task.peer-status-tcp-failed')} ${tcp}`)
  if (utp > 0) parts.push(`${t('task.peer-status-utp-failed')} ${utp}`)
  if (udp > 0) parts.push(`${t('task.peer-status-udp-punch-failed')} ${udp}`)
  return parts.length > 0 ? parts.join(' ') : ''
}

function getPeerInfo (ip) {
  if (!ip) return null
  const key = `${ip}`
  if (Object.prototype.hasOwnProperty.call(ipInfoCache.value, key)) {
    return ipInfoCache.value[key]
  }
  let info = null
  if (isPrivateIp(ip)) {
    info = { location: '-', countryCode: 'local' }
  } else {
    const result = searchInfoSync(ip)
    if (result && result.region) {
      let location = '-'
      if (result.country) location = result.country
      else if (result.province) location = result.province
      else if (result.city) location = result.city
      let code = result.countryCode || null
      if (!code) {
        const candidates = [result.country, result.province, result.city]
        for (const value of candidates) {
          code = countryNameToCode(value)
          if (code) break
        }
      }
      info = { location, countryCode: code }
    }
  }
  if (!info) info = { location: '-', countryCode: null }
  ipInfoCache.value[key] = info
  return info
}

function getPeerCountryCode (ip) {
  const info = getPeerInfo(ip)
  return info ? info.countryCode : null
}

function getPeerCountryClass (ip) {
  const code = getPeerCountryCode(ip)
  if (!code) return ''
  if (code === 'local') {
    return ['mo-peer-flag', 'mo-peer-flag-local']
  }
  return ['fi', `fi-${code.toLowerCase()}`, 'mo-peer-flag']
}

function isPrivateIp (ip) {
  const value = `${ip || ''}`.trim()
  if (!value) return false
  const lower = value.toLowerCase()
  if (lower === 'localhost') return true
  if (lower === '::1') return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (lower.startsWith('fe80:')) return true
  const parts = value.split('.').map(p => Number(p))
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return false
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

function getPeerLocation (ip) {
  const info = getPeerInfo(ip)
  return info ? info.location : '-'
}

function getPeerIdPrefix (peer) {
  const peerId = typeof peer === 'string' ? peer : (peer && peer.peerId)
  if (!peerId) return ''
  let decoded = ''
  try {
    decoded = unescape(peerId)
  } catch (e) {
    decoded = `${peerId}`
  }
  const value = `${decoded || peerId}`.trim()
  if (!value) return ''
  return value.length >= 8 ? value.slice(0, 8) : value
}

function getSafePeerIdPrefix (peer) {
  const prefix = getPeerIdPrefix(peer)
  if (!prefix) return ''
  if (!/^[A-Za-z0-9-]+$/.test(prefix)) {
    return ''
  }
  return prefix
}

function isPeerClientUnknown (peer) {
  const peerId = typeof peer === 'string' ? peer : (peer && peer.peerId)
  const result = peerIdParser(peerId)
  if (result !== 'task.peer-client-unknown') {
    return false
  }
  const clientName = typeof peer === 'object' && peer
    ? (peer.clientName || peer.client || peer.client_name || peer.userAgent || peer.agent || peer.name || '')
    : ''
  return !`${clientName}`.trim()
}

function getPeerClientTooltip (peer) {
  if (isPeerClientUnknown(peer)) {
    return ''
  }
  const clientText = renderPeerClient(peer)
  const prefix = getPeerIdPrefix(peer)
  if (!prefix) return clientText
  return `${clientText} / ${prefix}`
}

function renderPeerClient (peer) {
  const peerId = typeof peer === 'string' ? peer : (peer && peer.peerId)
  const result = peerIdParser(peerId)
  if (result === 'task.peer-client-unknown') {
    const clientName = typeof peer === 'object' && peer
      ? (peer.clientName || peer.client || peer.client_name || peer.userAgent || peer.agent || peer.name || '')
      : ''
    const normalizedName = `${clientName}`.trim()
    if (normalizedName) {
      return `${normalizedName} / N/A`
    }
    const prefix = getSafePeerIdPrefix(peer)
    return prefix || '-'
  }
  return result
}

function formatDuration (seconds) {
  const s = Number(seconds) || 0
  if (s <= 0) return '0s'
  const i18nObj = {
    hour: t('app.hour') || 'h',
    minute: t('app.minute') || 'm',
    second: t('app.second') || 's'
  }
  return timeFormat(s, { i18n: i18nObj })
}

function updateTableHeight () {
  // height="100%" handled by CSS
}

function handleSortChange ({ prop, order }) {
  sortProp.value = prop || 'downloadSpeed'
  sortOrder.value = order || 'descending'
}

function getLocationFromIp (ip) {
  const info = getPeerInfo(ip)
  return info ? info.location : '-'
}

function countryNameToCode (countryName) {
  const name = `${countryName || ''}`.trim()
  if (!name) return null
  return COUNTRY_NAME_TO_CODE[name] || null
}

function getPeerSource (peer) {
  if (!peer) return '-'
  const source = `${peer.source || ''}`.toLowerCase()
  if (source === 'lsd') return t('task.peer-source-lsd')
  if (source === 'dht') return t('task.peer-source-dht')
  if (source === 'pex') return t('task.peer-source-pex')
  if (source === 'tracker') return t('task.peer-source-tracker')
  if (source === 'manual') return t('task.peer-source-manual')
  if (peer.localPeer === 'true' || peer.localPeer === true) return t('task.peer-source-lsd')
  if (peer.fromDHT === 'true' || peer.fromDHT === true) return t('task.peer-source-dht')
  if (peer.fromPEX === 'true' || peer.fromPEX === true) return t('task.peer-source-pex')
  return '-'
}

function getPeerProtocol (peer) {
  if (!peer) return '-'
  const protocol = `${peer.protocol || ''}`.toLowerCase()
  if (protocol === 'tcp') return t('task.peer-protocol-tcp')
  if (protocol === 'utp') return t('task.peer-protocol-utp')
  if (protocol === 'tcp-ext') return t('task.peer-protocol-tcp-ext')
  if (protocol === 'utp-ext') return t('task.peer-protocol-utp-ext')
  return protocol || '-'
}

function getPeerEncryption (peer) {
  if (!peer) return '-'
  const encrypted = peer.encrypted
  if (encrypted === null || encrypted === undefined) return '-'
  if (encrypted === true || encrypted === 'true' || encrypted === '1' || encrypted === 1) {
    return t('task.peer-encryption-mse')
  }
  return t('task.peer-encryption-plaintext')
}

function getPeerStatus (peer) {
  if (!peer) return '-'
  const status = `${peer.engineStatus || ''}`.toLowerCase()
  if (status === 'banned') return t('task.peer-status-banned')
  if (status === 'attempting') return t('task.peer-status-attempting')
  if (status === 'downloading') return t('task.peer-status-downloading')
  if (status === 'uploading') return t('task.peer-status-uploading')
  if (status === 'seeding') return t('task.peer-status-seeding')
  if (status === 'idle') return t('task.peer-status-idle')
  return '-'
}

function handleExpandChange (row, expanded) {
  if (row.isGroup) {
    if (expanded) {
      if (!expandedGroupKeys.value.includes(row.id)) {
        expandedGroupKeys.value.push(row.id)
      }
    } else {
      expandedGroupKeys.value = expandedGroupKeys.value.filter(k => k !== row.id)
    }
  }
}

function handleSpanMethod ({ row, column, rowIndex, columnIndex }) {
  if (row.isGroup) {
    if (columnIndex === 0) {
      return [1, 12]
    } else {
      return [0, 0]
    }
  }
}

function handleRowClick (row) {
  if (row.isGroup) {
    peerTable.value.toggleRowExpansion(row)
  }
}

function handleRowContextMenu (row, column, event) {
  if (!row.isGroup) {
    event.preventDefault()
    contextMenuPeer.value = row
    contextMenuType.value = 'peer'

    const isBanned = row && row.status === 'banned'
    const menuWidth = 160
    const menuItems = isBanned ? 5 : 4
    const menuHeight = menuItems * 36 + 10
    openContextMenu(event, menuWidth, menuHeight)
  }
}

function handleTableContextMenu (event) {
  const target = event && event.target
  if (target && (target.closest('.el-table__row') || target.closest('.el-table__header-wrapper'))) {
    return
  }
  contextMenuPeer.value = null
  contextMenuType.value = 'blank'
  const menuWidth = 180
  const menuItems = 5
  const menuHeight = menuItems * 36 + 10
  openContextMenu(event, menuWidth, menuHeight)
}

function openContextMenu (event, menuWidth, menuHeight) {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  let x = event.clientX
  let y = event.clientY

  if (x + menuWidth > windowWidth) {
    x = windowWidth - menuWidth - 5
  }
  if (y + menuHeight > windowHeight) {
    y = windowHeight - menuHeight - 5
  }
  if (x < 5) x = 5
  if (y < 5) y = 5

  contextMenuX.value = x
  contextMenuY.value = y
  contextMenuVisible.value = true

  if (contextMenuCloseHandler) {
    document.removeEventListener('click', contextMenuCloseHandler)
  }
  contextMenuCloseHandler = (e) => {
    const target = e && e.target
    if (target && target.closest && target.closest('.mo-peer-context-menu')) {
      return
    }
    closeContextMenu()
  }
  if (contextMenuTimer) {
    clearTimeout(contextMenuTimer)
  }
  contextMenuTimer = setTimeout(() => {
    contextMenuTimer = null
    document.addEventListener('click', contextMenuCloseHandler)
  }, 100)
}

function closeContextMenu () {
  contextMenuVisible.value = false
  contextMenuPeer.value = null
  contextMenuType.value = ''
  if (contextMenuCloseHandler) {
    document.removeEventListener('click', contextMenuCloseHandler)
    contextMenuCloseHandler = null
  }
}

function togglePeerGroupVisibility (key) {
  const current = peerGroupVisibility.value
  const next = {
    connected: current.connected,
    attempting: current.attempting,
    banned: current.banned,
    disconnected: current.disconnected
  }
  if (Object.prototype.hasOwnProperty.call(next, key)) {
    next[key] = !next[key]
    savePeerGroupVisibility(next)
  }
  closeContextMenu()
}

function resetPeerGroupVisibility () {
  const next = {
    connected: true,
    attempting: true,
    banned: true,
    disconnected: true
  }
  savePeerGroupVisibility(next)
  closeContextMenu()
}

function savePeerGroupVisibility (next) {
  preferenceStore.save({
    peerGroupVisibility: next
  })
}

async function banPeer (duration) {
  const peer = contextMenuPeer.value
  closeContextMenu()

  if (!peer) return
  const ip = String(peer.ip || '')
  const isBanned = peer.status === 'banned'

  if (!ip) {
    msg.error('Invalid IP address')
    return
  }

  try {
    let durationText = ''
    if (duration === 300) {
      durationText = t('task.ban-duration-5min')
    } else if (duration === 3600) {
      durationText = t('task.ban-duration-1hour')
    } else if (duration === 86400) {
      durationText = t('task.ban-duration-1day')
    } else {
      durationText = t('task.ban-duration-forever')
    }

    const confirmMessage = isBanned
      ? t('task.extend-ban-confirm', { ip, duration: durationText })
      : t('task.ban-peer-confirm', { ip, duration: durationText })
    const confirmTitle = isBanned
      ? t('task.extend-ban-title')
      : t('task.ban-peer-title')

    await ElMessageBox.confirm(
      confirmMessage,
      confirmTitle,
      {
        confirmButtonText: t('app.yes'),
        cancelButtonText: t('app.no'),
        type: 'warning'
      }
    )

    await taskStore.banPeer({
      gid: props.task.gid,
      ip: ip,
      duration: duration
    })

    msg.success(t('task.ban-peer-success', { ip }))
  } catch (err) {
    if (err !== 'cancel') {
      console.error('[TaskPeers] Ban peer failed:', err)
      msg.error(t('task.ban-peer-failed'))
    }
  }
}

async function unbanPeer () {
  const peer = contextMenuPeer.value
  closeContextMenu()

  if (!peer) return
  const ip = String(peer.ip || '')

  if (!ip) {
    msg.error('Invalid IP address')
    return
  }

  try {
    await ElMessageBox.confirm(
      t('task.unban-peer-confirm', { ip }),
      t('task.unban-peer-title'),
      {
        confirmButtonText: t('app.yes'),
        cancelButtonText: t('app.no'),
        type: 'info'
      }
    )

    await taskStore.unbanPeer({
      gid: props.task.gid,
      ip: ip
    })

    msg.success(t('task.unban-peer-success', { ip }))
  } catch (err) {
    if (err !== 'cancel') {
      console.error('[TaskPeers] Unban peer failed:', err)
      msg.error(t('task.unban-peer-failed'))
    }
  }
}

defineExpose({
  updateTableHeight
})
</script>

<style lang="scss">
.mo-task-peers {
  height: 100%;
  display: flex;
  flex-direction: column;
  .mo-table-wrapper {
    border: 1px solid var(--lc-border-base);
    border-radius: 8px;
    box-sizing: border-box;
    padding: 0;
  }
}
.mo-table-wrapper {
  flex: 1;
  overflow: hidden;
  min-height: 200px;
  position: relative;
  border-radius: 8px;
}
.el-table.mo-peer-table {
  height: 100% !important;
  border: none !important;
  border-radius: 8px;
  overflow: hidden;
  &::before, &::after {
    display: none !important;
  }
  .el-table--border::after, .el-table--group::after {
    display: none !important;
  }
  // 修复滚动条出现时表头错位问题（针对自定义滚动条优化）
  th.gutter, colgroup.gutter {
    display: none !important;
    width: 0 !important;
  }
  .el-table__header colgroup col[name="gutter"] {
    display: none !important;
    width: 0 !important;
  }
  // 修复底部边框重复导致粗细不一
  .el-table__body tr:last-child td {
    border-bottom: none !important;
  }
  th.el-table__cell {
    border-bottom: none !important;
  }
  .cell {
    padding-left: 10px !important;
    padding-right: 10px !important;
  }
  .mo-peer-text {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    position: relative;
    text-overflow: ellipsis;
  }
  .mo-peer-location {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    .mo-peer-text {
      flex: 1;
      min-width: 0;
    }
  }
  .mo-peer-flag {
    width: 20px;
    height: 15px;
    border-radius: 2px;
    flex-shrink: 0;
    box-shadow: 0 0 1px rgba(0, 0, 0, 0.2);
  }
  .mo-peer-flag-local {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #67c23a;
    box-shadow: inset 0 0 0 2px #f5f7fa, 0 0 1px rgba(0, 0, 0, 0.2);
  }
  .mo-peer-group-label {
    font-weight: 600;
    color: var(--lc-text-secondary);
    font-size: 13px;
    line-height: 1;
    margin-left: 4px;
    vertical-align: middle;
  }
.mo-peer-group-row {
    background-color: var(--lc-table-striped-bg, #f5f7fa) !important;
    cursor: pointer;
    position: sticky;
    top: 0;
    z-index: 10;
    td,
    td.el-table__cell {
      background-color: var(--lc-table-striped-bg, #f5f7fa) !important;
    }
  }
  // 严格强制单行高度并修复对齐
  .el-table__row {
    height: 32px !important;
    td {
      padding: 0 !important;
      .cell {
        line-height: 32px !important;
        height: 32px !important;
        display: flex;
        align-items: center;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        // 确保内边距与表头一致 (Element UI 默认 10px)
        padding-left: 10px !important;
        padding-right: 10px !important;
      }
      // 根据 Element UI 的类名处理水平对齐
      &.is-right .cell {
        justify-content: flex-end;
        text-align: right;
      }
      &.is-center .cell {
        justify-content: center;
        text-align: center;
      }
    }
  }
  // 树形结构图标对齐
  .el-table__indent, .el-table__placeholder {
    margin: 0 !important;
    vertical-align: middle;
    display: inline-block;
  }
  .el-table__expand-icon {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    height: 32px !important;
    width: 24px !important;
    line-height: 32px !important;
    margin: 0 !important;
    cursor: pointer;
    // 修复旋转时可能产生的偏移
    transition: transform 0.2s ease-in-out;
    .el-icon {
      font-size: 14px;
      line-height: 1;
    }
  }
}
.el-table.mo-peer-table .el-table__body tr.mo-peer-row-active > td,
.el-table.mo-peer-table .el-table__body tr.mo-peer-row-active > td.el-table__cell {
  background-color: rgba(64, 158, 255, 0.12) !important;
}
.el-table.mo-peer-table .el-table__body tr.mo-peer-row-active:hover > td,
.el-table.mo-peer-table .el-table__body tr.mo-peer-row-active:hover > td.el-table__cell {
  background-color: rgba(64, 158, 255, 0.12) !important;
}
.mo-best-peer {
  background: transparent;
  border: 1px solid var(--lc-border-base);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  overflow-x: auto;
  white-space: nowrap;
}
.best-peer-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--lc-text-secondary);
  margin-bottom: 8px;
}
.best-peer-info {
  display: flex;
  flex-wrap: nowrap;
  gap: 16px;
}
.best-peer-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.best-peer-key {
  color: var(--lc-text-secondary);
}
.best-peer-value {
  color: var(--lc-text-regular);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  .mo-peer-flag {
    width: 20px;
    height: 15px;
    border-radius: 2px;
    box-shadow: 0 0 1px rgba(0, 0, 0, 0.2);
  }
}

// 右键菜单样式
.mo-peer-context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--lc-bg-popover, #fff);
  border: 1px solid var(--lc-border-base);
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  padding: 5px 0;
  min-width: 150px;

  .context-menu-item {
    height: 36px;
    line-height: 36px;
    padding: 0 20px;
    font-size: 13px;
    color: var(--lc-text-regular);
    cursor: pointer;

    i {
      margin-right: 8px;
      color: #f56c6c;
    }

    &:hover {
      background-color: var(--lc-color-primary-light);
      color: var(--lc-color-primary);
    }
  }

  .context-menu-divider {
    height: 1px;
    background-color: var(--lc-border-base);
    margin: 5px 0;
  }
}

// 暗色主题适配 - 与 el-table 保持一致
.theme-dark .mo-best-peer {
  background: transparent;
  border-color: var(--lc-border-base);
}
.theme-dark .best-peer-label {
  color: var(--lc-text-secondary);
}
.theme-dark .best-peer-key {
  color: var(--lc-text-secondary);
}
.theme-dark .best-peer-value {
  color: var(--lc-text-regular);
}
.theme-dark .mo-peer-context-menu {
  background: var(--lc-bg-popover);
  border-color: var(--lc-border-base);

  .context-menu-item {
    color: var(--lc-text-regular);

    &:hover {
      background-color: var(--lc-color-primary-light);
      color: var(--lc-color-primary);
    }
  }

  .context-menu-divider {
    background-color: var(--lc-border-base);
  }
}
.theme-dark .mo-task-peers .mo-table-wrapper {
  border-color: var(--lc-border-base) !important;
  background-color: var(--lc-task-item-bg) !important;
}
.theme-dark .mo-peer-table {
  border-color: transparent !important;
  background-color: transparent !important;
  color: var(--lc-text-regular) !important;
  .el-table__inner-wrapper {
    background-color: transparent !important;
  }
  .el-table__header-wrapper,
  .el-table__body-wrapper,
  .el-table__footer-wrapper {
    background-color: transparent !important;
  }
  .el-table__header,
  .el-table__body,
  .el-table__footer {
    background-color: transparent !important;
  }
  .el-table__row {
    background-color: transparent !important;
    // 树形表格子行（不同层级）背景强制透明
    &.el-table__row--level-0,
    &.el-table__row--level-1,
    &.el-table__row--level-2 {
      background-color: transparent !important;
      td {
        background-color: transparent !important;
      }
    }
  }
  // 悬停高亮：强制覆盖 Element UI 默认白色背景
  .el-table__body tr:hover > td,
  .el-table__body tr:hover > td.el-table__cell,
  .el-table--enable-row-hover .el-table__body tr:hover > td {
    background-color: var(--lc-table-hover-bg) !important;
  }
  .mo-peer-group-row {
    background-color: var(--lc-table-striped-bg) !important;
    color: var(--lc-text-secondary) !important;
    &.el-table__row td,
    td.el-table__cell {
      background-color: var(--lc-table-striped-bg) !important;
      border-bottom: 1px solid var(--lc-border-base) !important;
    }
    .mo-peer-group-label {
      color: var(--lc-text-secondary) !important;
    }
    &.el-table__row:hover > td,
    &:hover > td {
      background-color: var(--lc-table-hover-bg) !important;
    }
  }
  .el-table__expand-icon {
    color: var(--lc-text-secondary) !important;
    background-color: transparent !important;
  }
  &.el-table thead th,
  &.el-table thead th.el-table__cell,
  &.el-table thead th.is-leaf,
  &.el-table thead th.el-table__cell.is-leaf {
    background-color: transparent !important;
    color: var(--lc-text-secondary) !important;
    border-bottom: none !important;
  }
  td.el-table__cell {
    background-color: transparent !important;
    color: var(--lc-text-regular) !important;
    border-bottom: 1px solid var(--lc-border-base) !important;
  }
  .el-table__empty-block {
    background-color: transparent !important;
  }
  .el-table__empty-text {
    color: var(--lc-text-placeholder) !important;
  }
  .el-table--border::after, .el-table--group::after, .el-table::before {
    display: none !important;
  }
  .el-checkbox__inner {
    background-color: var(--lc-bg-input) !important;
    border-color: var(--lc-border-base) !important;
  }
}
.theme-dark .el-table.mo-peer-table .el-table__body tr.mo-peer-row-active > td,
.theme-dark .el-table.mo-peer-table .el-table__body tr.mo-peer-row-active > td.el-table__cell {
  background-color: rgba(64, 158, 255, 0.2) !important;
}
.theme-dark .el-table.mo-peer-table .el-table__body tr.mo-peer-row-active:hover > td,
.theme-dark .el-table.mo-peer-table .el-table__body tr.mo-peer-row-active:hover > td.el-table__cell {
  background-color: rgba(64, 158, 255, 0.2) !important;
}
</style>
