<template>
  <div class="eval-layout">
    <!-- Top bar -->
    <div class="eval-top">
      <span class="eval-title">📊 RAG 测评</span>
      <div class="eval-nav">
        <router-link to="/chat" class="nav-link">💬 对话</router-link>
        <router-link to="/documents" class="nav-link">📁 文档管理</router-link>
      </div>
    </div>

    <!-- Main content -->
    <div class="eval-main" ref="msgBox">
      <!-- Empty state -->
      <div v-if="!submitted" class="empty-state">
        <div class="empty-icon">🧪</div>
        <div class="empty-text">输入问题开始 RAG 质量测评</div>
        <div class="empty-hint">系统将从安全性、事实性、答案正确性、相关性和检索质量五个维度评估回答</div>
      </div>

      <!-- User question -->
      <div v-if="question" class="msg-row user">
        <div class="avatar">👤</div>
        <div class="msg-body">
          <div class="role-name">你</div>
          <div class="bubble">{{ question }}</div>
        </div>
      </div>

      <!-- Assistant response -->
      <div v-if="result" class="msg-row assistant">
        <div class="avatar">🤖</div>
        <div class="msg-body">
          <div class="role-name">AI Assistant</div>

          <!-- Block intervention -->
          <div v-if="intervention?.action === 'block'" class="block-notice">
            <div class="block-icon">🚫</div>
            <div class="block-title">回答已被阻止</div>
            <div class="block-reason">{{ intervention.reason }}</div>
          </div>

          <!-- Degrade notice -->
          <div v-else-if="intervention?.action === 'degrade'" class="degrade-notice">
            ⚠️ 回答已被降级 — {{ intervention.reason }}
          </div>

          <!-- Warn notice -->
          <div v-if="intervention?.action === 'warn'" class="warn-notice">
            ⚠️ {{ intervention.reason }}
          </div>

          <!-- Answer (hidden when blocked) -->
          <div v-if="intervention?.action !== 'block'" class="bubble md" v-html="renderMd(result.answer)" />

          <!-- Source cards -->
          <div v-if="sources.length" class="source-cards">
            <div class="source-item" v-for="(s, si) in sources" :key="si">
              <span class="source-idx">[{{ si + 1 }}]</span>
              <span class="source-fname">📄 {{ s.filename }}</span>
              <span class="source-snippet">{{ s.snippet?.slice(0, 80) }}{{ s.snippet?.length > 80 ? '…' : '' }}</span>
            </div>
          </div>

          <!-- Quality scorecards -->
          <div v-if="qualityKeys.length" class="scorecards">
            <div class="sc-title">📋 质量评估</div>
            <div class="sc-grid">
              <div v-for="dim in qualityKeys" :key="dim" class="scorecard" :class="result.quality[dim].passed ? 'pass' : 'fail'">
                <div class="sc-header">
                  <span class="sc-dim">{{ dimLabel(dim) }}</span>
                </div>
                <div class="sc-score-row">
                  <span class="sc-score-label">评分</span>
                  <div class="sc-score-bar-bg">
                    <div class="sc-score-bar-fill" :style="{ width: (result.quality[dim].score * 100) + '%' }"></div>
                  </div>
                  <span class="sc-score-val">{{ (result.quality[dim].score * 100).toFixed(0) }}</span>
                </div>
                <div class="sc-details" v-if="readableDesc(dim)">{{ readableDesc(dim) }}</div>
                <div class="sc-tech" v-if="techDesc(dim)">{{ techDesc(dim) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="msg-row assistant">
        <div class="avatar">🤖</div>
        <div class="think-bubble">🔍 正在评估...<span class="dots">{{ dots }}</span></div>
      </div>
    </div>

    <!-- Input bar -->
    <div class="input-bar">
      <div class="gt-wrap">
        <input v-model="groundTruth" class="gt-input" placeholder="标准答案（选填，用于答案正确性校验）" />
      </div>
      <div class="input-wrap">
        <textarea v-model="input" class="msg-input" placeholder="输入问题... (Enter 发送, Shift+Enter 换行)" @keydown.enter="onEnter" ref="inputEl"></textarea>
        <div class="input-actions">
          <button class="act-btn send" :disabled="!input.trim() || loading" @click="send" title="发送">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onUnmounted, watch } from 'vue'
import { marked } from 'marked'
import api from '../api'

interface Source {
  doc_id: string
  filename: string
  snippet: string
  score?: number
}

interface VerdictDetail {
  dimension: string
  passed: boolean
  score: number
  details: string
}

interface Intervention {
  intervened: boolean
  action: 'none' | 'block' | 'degrade' | 'warn'
  reason: string
  violations: Array<{
    dimension: string
    passed: boolean
    score: number
    details: string
  }>
}

interface EvalResponse {
  answer: string
  sources: Source[]
  quality: Record<string, VerdictDetail>
  intervention: Intervention | null
}

function renderMd(text: string) {
  return text ? marked.parse(text) : ''
}

const input = ref('')
const groundTruth = ref('')
const question = ref('')
const result = ref<EvalResponse | null>(null)
const sources = ref<Source[]>([])
const intervention = ref<Intervention | null>(null)
const loading = ref(false)
const submitted = ref(false)
const msgBox = ref<HTMLElement>()
const inputEl = ref<HTMLTextAreaElement>()
const dots = ref('.')
let dotsTimer: ReturnType<typeof setInterval> | null = null

const qualityKeys = ref<string[]>([])

const dimLabels: Record<string, string> = {
  safety: '🛡️ 安全性',
  factuality: '📖 事实性',
  answer_correctness: '✅ 答案正确性',
  relevance: '🎯 相关性',
  retrieval_quality: '🔍 检索质量',
}

function dimLabel(key: string): string {
  return dimLabels[key] || key
}

function readableDesc(dim: string): string {
  const d = result.value?.quality[dim]?.details || ''
  const idx = d.indexOf(' || ')
  return idx >= 0 ? d.slice(0, idx) : d
}

function techDesc(dim: string): string {
  const d = result.value?.quality[dim]?.details || ''
  const idx = d.indexOf(' || ')
  return idx >= 0 ? d.slice(idx + 4) : ''
}

watch(loading, (v) => {
  if (v) {
    let n = 1
    dotsTimer = setInterval(() => {
      n = (n % 3) + 1
      dots.value = '.'.repeat(n)
    }, 400)
  } else {
    if (dotsTimer) clearInterval(dotsTimer)
    dotsTimer = null
    dots.value = '.'
  }
})

onUnmounted(() => {
  if (dotsTimer) clearInterval(dotsTimer)
})

function onEnter(e: KeyboardEvent) {
  if (!e.shiftKey) {
    e.preventDefault()
    send()
  }
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return
  input.value = ''
  if (inputEl.value) {
    inputEl.value.style.height = 'auto'
  }

  question.value = text
  result.value = null
  sources.value = []
  intervention.value = null
  qualityKeys.value = []
  submitted.value = true
  loading.value = true

  try {
    const res = await api.post('/query/eval', {
      question: text,
      top_k: 5,
      ground_truth: groundTruth.value || undefined,
    })
    const data = res.data as EvalResponse
    result.value = data
    sources.value = data.sources || []
    intervention.value = data.intervention
    qualityKeys.value = Object.keys(data.quality || {})
    scrollDown()
  } catch (e: any) {
    result.value = {
      answer: '请求失败: ' + (e.response?.data?.detail || e.message),
      sources: [],
      quality: {},
      intervention: null,
    }
    sources.value = []
    intervention.value = null
    qualityKeys.value = []
  }
  loading.value = false
  scrollDown()
}

function scrollDown() {
  nextTick(() => {
    if (msgBox.value) {
      msgBox.value.scrollTop = msgBox.value.scrollHeight
    }
  })
}

watch(input, () => {
  nextTick(() => {
    if (inputEl.value) {
      inputEl.value.style.height = 'auto'
      inputEl.value.style.height = inputEl.value.scrollHeight + 'px'
    }
  })
})
</script>

<style scoped>
.eval-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f0f2f5;
}

/* Top bar */
.eval-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}
.eval-title {
  font-weight: 600;
  font-size: 14px;
}
.eval-nav {
  display: flex;
  gap: 16px;
}
.nav-link {
  color: #409eff;
  text-decoration: none;
  font-size: 13px;
}
.nav-link:hover {
  color: #337ecc;
}

/* Main */
.eval-main {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #909399;
}
.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}
.empty-text {
  font-size: 16px;
  color: #606266;
  margin-bottom: 8px;
}
.empty-hint {
  font-size: 13px;
  color: #909399;
}

/* Messages */
.msg-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.msg-row.user {
  flex-direction: row-reverse;
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}
.msg-row.user .avatar {
  background: #409eff;
}
.msg-row.assistant .avatar {
  background: #67c23a;
}
.role-name {
  font-size: 11px;
  color: #909399;
  margin-bottom: 2px;
}
.msg-row.user .role-name {
  text-align: right;
}
.msg-body {
  max-width: 620px;
}
.bubble {
  max-width: 600px;
  padding: 10px 14px;
  border-radius: 8px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
}
.msg-row.user .bubble {
  background: #409eff;
  color: #fff;
}
.msg-row.assistant .bubble {
  background: #fff;
  color: #303133;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.think-bubble {
  font-size: 12px;
  color: #909399;
  font-style: italic;
  padding: 6px 12px;
  background: transparent;
}
.dots {
  color: #409eff;
  font-weight: bold;
}

/* Intervention notices */
.block-notice {
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 8px;
  padding: 14px;
  text-align: center;
  margin-bottom: 8px;
}
.block-icon {
  font-size: 32px;
  margin-bottom: 8px;
}
.block-title {
  font-weight: 600;
  color: #f56c6c;
  font-size: 15px;
  margin-bottom: 6px;
}
.block-reason {
  font-size: 13px;
  color: #606266;
}
.degrade-notice {
  background: #fdf6ec;
  border: 1px solid #faecd8;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  color: #e6a23c;
  margin-bottom: 8px;
}
.warn-notice {
  background: #fdf6ec;
  border: 1px solid #faecd8;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  color: #e6a23c;
  margin-bottom: 8px;
}

/* Source cards */
.source-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  margin-bottom: 8px;
}
.source-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #f0f9eb;
  border-radius: 6px;
  border: 1px solid #e1f3d8;
  font-size: 12px;
  cursor: default;
  max-width: 280px;
  overflow: hidden;
}
.source-idx {
  font-weight: 600;
  color: #67c23a;
  font-size: 11px;
  flex-shrink: 0;
}
.source-fname {
  color: #303133;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.source-snippet {
  color: #909399;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Scorecards */
.scorecards {
  margin-top: 12px;
}
.sc-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 10px;
}
.sc-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.scorecard {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px;
  background: #fff;
  border-left: 4px solid #e4e7ed;
}
.scorecard.pass {
  border-left-color: #67c23a;
}
.scorecard.fail {
  border-left-color: #f56c6c;
}
.sc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.sc-dim {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.sc-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}
.sc-badge.pass {
  background: #f0f9eb;
  color: #67c23a;
}
.sc-badge.fail {
  background: #fef0f0;
  color: #f56c6c;
}
.sc-score-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.sc-score-label {
  font-size: 11px;
  color: #909399;
  flex-shrink: 0;
}
.sc-score-bar-bg {
  flex: 1;
  height: 6px;
  background: #ebeef5;
  border-radius: 3px;
  overflow: hidden;
}
.sc-score-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}
.scorecard.pass .sc-score-bar-fill {
  background: #67c23a;
}
.scorecard.fail .sc-score-bar-fill {
  background: #f56c6c;
}
.sc-score-val {
  font-size: 12px;
  font-weight: 600;
  color: #303133;
  flex-shrink: 0;
  width: 28px;
  text-align: right;
}
.sc-details {
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
}
.sc-tech {
  font-size: 11px;
  color: #909399;
  line-height: 1.5;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed #e4e7ed;
  font-family: Consolas, monospace;
}

/* Input bar */
.input-bar {
  padding: 16px 20px;
  background: #fff;
  border-top: 1px solid #e4e7ed;
}
.gt-wrap {
  margin-bottom: 8px;
}
.gt-input {
  display: block;
  width: 100%;
  padding: 8px 14px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
  color: #909399;
}
.gt-input:focus {
  border-color: #409eff;
  color: #303133;
}
.input-wrap {
  position: relative;
}
.msg-input {
  display: block;
  width: 100%;
  padding: 12px 60px 12px 14px;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.6;
  resize: none;
  outline: none;
  min-height: 48px;
  max-height: 200px;
  box-sizing: border-box;
}
.msg-input:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.06);
}
.input-actions {
  position: absolute;
  right: 6px;
  bottom: 8px;
  display: flex;
  gap: 4px;
}
.act-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  color: #909399;
}
.act-btn:hover {
  border-color: #409eff;
  background: #ecf5ff;
  color: #409eff;
}
.act-btn.send {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
}
.act-btn.send:hover:not(:disabled) {
  background: #337ecc;
}
.act-btn.send:disabled {
  background: #a0cfff;
  border-color: #a0cfff;
  cursor: not-allowed;
}
</style>

<style>
.md p {
  margin: 0 0 4px;
}
.md p:last-child {
  margin-bottom: 0;
}
.md code {
  background: rgba(0, 0, 0, 0.06);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 13px;
  font-family: Consolas, monospace;
}
.md pre {
  background: #f5f7fa;
  padding: 10px 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 6px 0;
}
.md pre code {
  background: none;
  padding: 0;
}
.md ul,
.md ol {
  padding-left: 20px;
  margin: 4px 0;
}
.md li {
  margin: 2px 0;
}
.md h1,
.md h2,
.md h3 {
  margin: 10px 0 4px;
  font-size: 1.1em;
}
.md h1 {
  font-size: 1.3em;
}
.md blockquote {
  border-left: 3px solid #409eff;
  padding-left: 10px;
  color: #606266;
  margin: 4px 0;
}
.md table {
  border-collapse: collapse;
  width: 100%;
  margin: 6px 0;
}
.md th,
.md td {
  border: 1px solid #dcdfe6;
  padding: 4px 8px;
  text-align: left;
  font-size: 13px;
}
.md th {
  background: #f5f7fa;
}
.md strong {
  font-weight: 600;
}
.md a {
  color: #409eff;
}
</style>
