<template>
  <el-main class="panel-content">
    <el-form
      class="form-preference"
      ref="videoForm"
      label-position="right"
      size="mini"
      :model="form"
      :rules="rules"
    >
      <div class="preference-card">
        <h3 class="card-title">{{ $t('preferences.video-sniffer-card') }}</h3>
        <el-form-item :label="$t('preferences.video-sniffer-enabled')">
          <el-col :span="16">
            <el-switch
              v-model="form.videoSnifferEnabled"
              active-color="#13ce66"
              inactive-color="#ff4949"
              @change="handleSwitchChange"
            />
          </el-col>
          <div class="el-form-item__info" style="margin-top: 8px;">
            {{ $t('preferences.video-sniffer-enabled-tips') }}
          </div>
        </el-form-item>

        <el-form-item :label="$t('preferences.video-sniffer-auto-combine')">
          <el-col :span="16">
            <el-switch
              v-model="form.videoSnifferAutoCombine"
              active-color="#13ce66"
              inactive-color="#ff4949"
              @change="handleSwitchChange"
            />
          </el-col>
          <div class="el-form-item__info" style="margin-top: 8px;">
            {{ $t('preferences.video-sniffer-auto-combine-tips') }}
          </div>
        </el-form-item>

        <el-form-item :label="$t('preferences.video-sniffer-formats')">
          <div class="format-list">
            <div v-for="(format, index) in form.videoSnifferFormats" :key="index" class="format-item">
              <span class="format-ext">.{{ format }}</span>
              <el-button
                type="danger"
                size="mini"
                icon="el-icon-delete"
                circle
                @click="removeFormat(index)"
              />
            </div>
            <div class="format-add">
              <el-input
                v-model="newFormatExt"
                size="mini"
                :placeholder="$t('preferences.video-sniffer-format-placeholder')"
                @keyup.enter.native="addFormat"
                style="width: 200px; margin-right: 8px;"
              >
                <template slot="prepend">.</template>
              </el-input>
              <el-button
                type="primary"
                size="mini"
                icon="el-icon-plus"
                @click="addFormat"
              >
                {{ $t('preferences.video-sniffer-add-format') }}
              </el-button>
            </div>
          </div>
          <div class="el-form-item__info" style="margin-top: 8px;">
            {{ $t('preferences.video-sniffer-formats-tips') }}
          </div>
        </el-form-item>
      </div>
    </el-form>

    <div v-if="hasNoResults" class="no-results">
      <div class="no-results-inner">
        {{ $t('preferences.no-settings-found') }}
      </div>
    </div>
  </el-main>
</template>

<script>
  import { mapState } from 'vuex'
  import { isEmpty } from 'lodash'
  import { diffConfig } from '@shared/utils'

  const initForm = (config) => {
    const c = config || {}
    return {
      videoSnifferEnabled: c['video-sniffer-enabled'] !== undefined ? c['video-sniffer-enabled'] : true,
      videoSnifferFormats: c['video-sniffer-formats'] || ['m4s', 'mp4', 'flv', 'm3u8', 'ts', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'mpd', 'ogv', '3gp', 'm4v', 'mpeg', 'mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus'],
      videoSnifferAutoCombine: c['video-sniffer-auto-combine'] !== undefined ? c['video-sniffer-auto-combine'] : true
    }
  }

  export default {
    name: 'mo-preference-video',
    data () {
      return {
        form: {},
        formOriginal: {},
        rules: {},
        saveTimeout: null,
        hasNoResults: false,
        newFormatExt: ''
      }
    },
    computed: {
      ...mapState('preference', {
        config: state => state.config,
        searchKeyword: state => state.searchKeyword
      })
    },
    watch: {
      searchKeyword: {
        handler (val) {
          this.filterCards(val)
        },
        immediate: true
      },
      config: {
        immediate: true,
        handler (val) {
          const f = initForm(val)
          this.form = f
          this.formOriginal = initForm(val)
        }
      },
      form: {
        deep: true,
        handler () {
          const hasChanges = !isEmpty(diffConfig(this.formOriginal, this.form))
          if (hasChanges) {
            this.autoSaveForm()
          }
        }
      }
    },
    methods: {
      handleSwitchChange () {
        this.autoSaveForm()
        this.$nextTick(() => {
          this.formOriginal = { ...this.form }
        })
      },
      filterCards (keyword) {
        this.$nextTick(() => {
          if (!this.$el) return
          const cards = this.$el.querySelectorAll('.preference-card')
          const k = (keyword || '').toLowerCase()
          let visibleCount = 0
          cards.forEach(card => {
            if (!k) {
              card.style.display = ''
              visibleCount++
              return
            }
            const text = card.textContent.toLowerCase()
            if (text.includes(k)) {
              card.style.display = ''
              visibleCount++
            } else {
              card.style.display = 'none'
            }
          })
          this.hasNoResults = visibleCount === 0 && k !== ''
        })
      },
      autoSaveForm () {
        console.log('[Video.vue] autoSaveForm triggered')
        if (this.saveTimeout) {
          clearTimeout(this.saveTimeout)
        }
        this.saveTimeout = setTimeout(() => {
          const diff = diffConfig(this.formOriginal, this.form)
          console.log('[Video.vue] config diff:', diff)
          if (!isEmpty(diff)) {
            this.submitForm(diff)
          } else {
            console.log('[Video.vue] no changes detected')
          }
        }, 100)
      },
      submitForm (payload) {
        console.log('[Video.vue] submitForm payload:', payload)
        this.$store.dispatch('preference/save', payload)
          .then(() => {
            this.formOriginal = initForm({ ...this.config, ...payload })
            this.$msg.success(this.$t('preferences.save-success-message'))
          })
          .catch(() => {
            this.$msg.error(this.$t('preferences.save-fail-message'))
          })
      },
      addFormat () {
        let ext = (this.newFormatExt || '').trim().toLowerCase()
        if (ext.startsWith('.')) {
          ext = ext.substring(1)
        }
        if (!ext) {
          this.$msg.warning(this.$t('preferences.video-sniffer-format-empty'))
          return
        }
        if (this.form.videoSnifferFormats.includes(ext)) {
          this.$msg.warning(this.$t('preferences.video-sniffer-format-exists'))
          return
        }
        this.form = {
          ...this.form,
          videoSnifferFormats: [...this.form.videoSnifferFormats, ext]
        }
        this.newFormatExt = ''
        this.autoSaveForm()
        this.$msg.success(this.$t('preferences.video-sniffer-format-added'))
        this.$nextTick(() => {
          this.formOriginal = { ...this.form }
        })
      },
      removeFormat (index) {
        const format = this.form.videoSnifferFormats[index]
        this.$confirm(
          this.$t('preferences.video-sniffer-format-remove-confirm', { format }),
          this.$t('preferences.video-sniffer-format-remove-title'),
          {
            confirmButtonText: this.$t('preferences.video-sniffer-format-remove-confirm-button'),
            cancelButtonText: this.$t('preferences.video-sniffer-format-remove-cancel-button'),
            type: 'warning'
          }
        ).then(() => {
          this.form = {
            ...this.form,
            videoSnifferFormats: this.form.videoSnifferFormats.filter((_, i) => i !== index)
          }
          this.autoSaveForm()
          this.$msg.success(this.$t('preferences.video-sniffer-format-removed'))
          this.$nextTick(() => {
            this.formOriginal = { ...this.form }
          })
        }).catch(() => {})
      }
    }
  }
</script>

<style lang="scss" scoped>
.no-results {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  user-select: none;
}

.no-results-inner {
  width: 100%;
  padding-top: 280px;
  background: transparent url('~@/assets/no-settings.svg') top center no-repeat;
  background-size: 400px auto;
  text-align: center;
  font-size: 14px;
  color: #666;
}

.format-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.format-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: #f5f7fa;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
  transition: all 0.3s;

  &:hover {
    background-color: #ecf5ff;
    border-color: #b3d8ff;
  }
}

.format-ext {
  font-size: 14px;
  font-weight: 600;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  color: #409eff;
  flex: 1;
}

.format-add {
  display: flex;
  align-items: center;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #dcdfe6;
}
</style>
