<template>
  <div class="chat-layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-hd">会话 <span class="btn-new" @click="newChat">+</span></div>
      <div class="session-list">
        <div v-for="s in sessions" :key="s.id" class="sess-item" :class="{on:s.id===currentId}" @click="switchTo(s.id)">
          <span class="sess-title">{{ s.title }}</span>
          <span class="sess-del" @click.stop="delSession(s.id)">×</span>
        </div>
      </div>
      <div class="sidebar-ft">
        <router-link to="/documents" class="link">📁 文档管理</router-link>
        <span class="link" @click="logout">🚪 退出</span>
      </div>
    </aside>

    <!-- Chat main -->
    <div class="chat-main">
      <div class="chat-top" v-if="!editingTitle" @dblclick="startRename">{{ currentTitle }}</div>
      <div class="chat-top" v-else><input v-model="newTitle" class="title-input" @keydown.enter="doRename" @blur="doRename" ref="titleInput" /></div>
      <div class="msg-area" ref="msgBox">
        <div v-for="(m,i) in messages" :key="i" class="msg-row" :class="m.role">
          <div class="avatar" v-text="m.role==='user'?'👤':'🤖'" />
          <div>
            <div class="role-name">{{ m.role==='user'?'你':'AI Assistant' }}</div>
            <div class="bubble md" v-html="renderMd(m.content)" />
          </div>
        </div>
        <div v-if="thinking" class="msg-row think-row">
          <div class="avatar">🤖</div>
          <div class="think-bubble">{{ thinking }}<span class="dots">{{ dots }}</span></div>
        </div>
      </div>
      <div class="input-bar">
        <textarea v-model="input" class="msg-input" placeholder="输入问题... (Enter 发送, Shift+Enter 换行)" @keydown.enter="onEnter" ref="inputEl"></textarea>
        <div class="input-actions">
          <label class="act-btn" title="上传文档">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            <input type="file" accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg" @change="onFile" style="display:none" />
          </label>
          <button class="act-btn send" :disabled="!input.trim()||loading" @click="send" title="发送">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { marked } from 'marked'
import api from '../api'

function renderMd(text: string) { return text ? marked.parse(text) : '' }

const sessions = ref<any[]>([])
const currentId = ref<string | null>(null)
const messages = ref<any[]>([])
const input = ref('')
const loading = ref(false)
const thinking = ref('')
const msgBox = ref<HTMLElement>()
const inputEl = ref<HTMLTextAreaElement>()
const currentTitle = ref('')
const dots = ref('.')
let dotsTimer: any = null

watch(loading, (v) => {
  if (v) {
    let n = 1
    dotsTimer = setInterval(() => { n = (n % 3) + 1; dots.value = '.'.repeat(n) }, 400)
  } else {
    clearInterval(dotsTimer); dotsTimer = null; dots.value = '.'
  }
})
onUnmounted(() => clearInterval(dotsTimer))

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })

async function loadSessions() {
  try { const r = await api.get('/sessions'); sessions.value = r.data.sessions } catch {}
}
async function switchTo(sid: string) {
  currentId.value = sid
  try {
    const r = await api.get(`/sessions/${sid}`)
    messages.value = r.data.messages; currentTitle.value = r.data.title
  } catch { messages.value = [] }
}
async function newChat() {
  currentId.value = null; messages.value = []; currentTitle.value = '新对话'
}
// Rename
const editingTitle = ref(false)
const newTitle = ref('')
const titleInput = ref<HTMLInputElement>()
function startRename() { newTitle.value = currentTitle.value; editingTitle.value = true; nextTick(() => titleInput.value?.focus()) }
async function doRename() {
  editingTitle.value = false
  const t = newTitle.value.trim(); if (!t || t === currentTitle.value || !currentId.value) return
  try { await api.patch(`/sessions/${currentId.value}?title=${encodeURIComponent(t.slice(0,100))}`); currentTitle.value = t.slice(0,100); await loadSessions() } catch {}
}
async function delSession(sid: string) {
  try { await api.delete(`/sessions/${sid}`) } catch {}
  if (currentId.value === sid) newChat()
  await loadSessions()
}
function onEnter(e: KeyboardEvent) { if (!e.shiftKey) { e.preventDefault(); send() } }
function logout() { localStorage.clear(); window.location.href = '/login' }

async function send() {
  const text = input.value.trim(); if (!text || loading.value) return
  input.value = ''
  if (inputEl.value) { inputEl.value.style.height = 'auto' }
  messages.value.push({ role: 'user', content: text })
  loading.value = true; thinking.value = '🔍 正在搜索知识库...'; scrollDown()

  try {
    if (!currentId.value) {
      const r = await api.post('/sessions', {}, { headers: headers() })
      currentId.value = r.data.id; currentTitle.value = '新对话'
      await loadSessions()
    }

    // Try RAG first
    let ragAnswer = ''
    const rejectWords = ['无法基于现有资料', '无法回答', '没有找到', '未找到', '没有提供', '没有提到', '未提及', '无关', '没有相关信息', '知识库中没有', '未就绪']
    try {
      const qr = await api.post('/query', { question: text, top_k: 3 })
      const ans = qr.data.answer || ''
      if (ans && !rejectWords.some(w => ans.includes(w))) {
        ragAnswer = ans
        thinking.value = '📖 在知识库中找到相关内容，正在整理...'
      } else {
        thinking.value = '💬 知识库无匹配结果，正在通过AI生成回答...'
      }
    } catch {
      thinking.value = '💬 正在通过AI生成回答...'
    }
    scrollDown()

    if (ragAnswer) {
      // RAG answer is good — use it directly, still save to session
      thinking.value = ''
      messages.value.push({ role: 'assistant', content: ragAnswer })
      // Save to session via chat with a no-op
      try { await api.post('/chat', { messages: messages.value.map((m:any)=>({role:m.role,content:m.content})), session_id: currentId.value }) } catch {}
    } else {
      // No good RAG result — call /chat/stream with SSE
      thinking.value = '💬 正在生成回答...'
      const hist = messages.value.map((m: any) => ({ role: m.role, content: m.content }))
      messages.value.push({ role: 'assistant', content: '' })
      const idx = messages.value.length - 1

      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: hist, session_id: currentId.value, temperature: 0, max_tokens: 4096 }),
      })
      const reader = resp.body?.getReader()
      if (reader) {
        const dec = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          for (const line of dec.decode(value, { stream: true }).split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const d = JSON.parse(line.slice(6))
                if (d.done) break
                if (d.c) messages.value[idx].content += d.c
                if (d.error) messages.value[idx].content = '[错误] ' + d.error
              } catch {}
            }
          }
        }
      }
      thinking.value = ''
    }
    await loadSessions()
  } catch (e: any) {
    thinking.value = ''
    messages.value.push({ role: 'assistant', content: '请求失败: ' + (e.response?.data?.detail || e.message) })
  }
  loading.value = false
  scrollDown()
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return
  loading.value = true; thinking.value = '📎 正在上传并解析文件...'; scrollDown()
  const form = new FormData(); form.append('file', file)
  try {
    const r = await api.post('/upload', form)
    messages.value.push({ role: 'user', content: `📎 ${file.name}\n请帮我分析这份文件的内容。` })
    thinking.value = '💬 正在生成回答...'; scrollDown()
    const cr = await api.post('/chat', {
      messages: [{ role: 'user', content: `我上传了一份文件（${file.name}），解析结果：${r.data.chunks_count||0} 个文本块。请根据这份文件的内容回答用户的问题。` }],
      session_id: currentId.value || undefined,
    })
    if (!currentId.value) {
      const sr = await api.post('/sessions', {}, { headers: headers() })
      currentId.value = sr.data.id; currentTitle.value = file.name.slice(0,10)
      await loadSessions()
    }
    thinking.value = ''
    messages.value.push({ role: 'assistant', content: cr.data.content })
  } catch (e: any) { thinking.value = ''; messages.value.push({ role: 'assistant', content: '上传失败: ' + (e.response?.data?.detail || e.message) }) }
  loading.value = false; scrollDown()
}

function scrollDown() { nextTick(() => { if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight }) }
watch(input, () => { nextTick(() => { if (inputEl.value) { inputEl.value.style.height = 'auto'; inputEl.value.style.height = inputEl.value.scrollHeight + 'px' } }) })
onMounted(loadSessions)
</script>

<style scoped>
.chat-layout { display: flex; height: 100vh; }
.sidebar { width: 200px; background: #2c2c2c; color: #ccc; display: flex; flex-direction: column; font-size: 13px; flex-shrink: 0; }
.sidebar-hd { padding: 12px; font-weight: 600; color: #fff; display: flex; justify-content: space-between; }
.btn-new { cursor: pointer; color: #409eff; font-size: 18px; }
.session-list { flex: 1; overflow-y: auto; }
.sess-item { display: flex; justify-content: space-between; padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #3a3a3a; }
.sess-item:hover,.sess-item.on { background: #3a3a3a; }
.sess-item.on { color: #409eff; }
.sess-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex:1; }
.sess-del { color: #666; padding: 0 4px; }
.sess-del:hover { color: #f56c6c; }
.sidebar-ft { padding: 10px 12px; border-top: 1px solid #3a3a3a; display: flex; flex-direction: column; gap: 6px; }
.link { color: #999; cursor: pointer; text-decoration: none; font-size: 12px; }
.link:hover { color: #fff; }
.chat-main { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #f0f2f5; }
.chat-top { padding: 10px 20px; background: #fff; font-weight: 600; font-size: 14px; border-bottom: 1px solid #e4e7ed; cursor: default; }
.title-input { border: 1px solid #409eff; border-radius: 4px; padding: 2px 8px; font-size: 14px; outline: none; width: 250px; }
.msg-area { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.msg-row { display: flex; gap: 10px; align-items: flex-start; }
.msg-row.user { flex-direction: row-reverse; }
.avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.msg-row.user .avatar { background: #409eff; }
.msg-row.assistant .avatar { background: #67c23a; }
.role-name { font-size: 11px; color: #909399; margin-bottom: 2px; }
.msg-row.user .role-name { text-align: right; }
.bubble { max-width: 600px; padding: 10px 14px; border-radius: 8px; line-height: 1.65; white-space: pre-wrap; word-break: break-word; font-size: 14px; }
.msg-row.user .bubble { background: #409eff; color: #fff; }
.msg-row.assistant .bubble { background: #fff; color: #303133; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
.think-row { margin-bottom: 0; }
.think-bubble {
  font-size: 12px; color: #909399; font-style: italic;
  padding: 6px 12px; background: transparent;
}
.dots { display: inline-block; width: 20px; color: #409eff; font-weight: bold; }
.input-bar { padding: 16px 20px; background: #fff; border-top: 1px solid #e4e7ed; }
.msg-input { display: block; width: 100%; padding: 12px 14px; border: 1px solid #dcdfe6; border-radius: 10px; font-size: 14px; font-family: inherit; line-height: 1.6; resize: none; outline: none; min-height: 100px; max-height: 250px; }
.msg-input:focus { border-color: #409eff; box-shadow: 0 0 0 3px rgba(64,158,255,.06); }
.input-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
.act-btn { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 1px solid #dcdfe6; border-radius: 8px; background: #fff; cursor: pointer; color: #909399; }
.act-btn:hover { border-color: #409eff; background: #ecf5ff; color: #409eff; }
.act-btn.send { background: #409eff; border-color: #409eff; color: #fff; }
.act-btn.send:hover:not(:disabled) { background: #337ecc; }
.act-btn.send:disabled { background: #a0cfff; border-color: #a0cfff; cursor: not-allowed; }
</style>

<style>
.md p { margin: 0 0 6px; }
.md p:last-child { margin-bottom: 0; }
.md code { background: rgba(0,0,0,.06); padding: 2px 6px; border-radius: 3px; font-size: 13px; font-family: Consolas,monospace; }
.md pre { background: #f5f7fa; padding: 10px 12px; border-radius: 6px; overflow-x: auto; margin: 6px 0; }
.md pre code { background: none; padding: 0; }
.md ul, .md ol { padding-left: 20px; margin: 4px 0; }
.md li { margin: 2px 0; }
.md h1,.md h2,.md h3 { margin: 10px 0 4px; font-size: 1.1em; }
.md h1 { font-size: 1.3em; }
.md blockquote { border-left: 3px solid #409eff; padding-left: 10px; color: #606266; margin: 4px 0; }
.md table { border-collapse: collapse; width: 100%; margin: 6px 0; }
.md th,.md td { border: 1px solid #dcdfe6; padding: 4px 8px; text-align: left; font-size: 13px; }
.md th { background: #f5f7fa; }
.md strong { font-weight: 600; }
.md a { color: #409eff; }
</style>
