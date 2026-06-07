<template>
  <div class="doc-page">
    <div class="top-bar">
      <h2>📁 知识库管理</h2>
      <div class="top-actions">
        <select v-model="chunkStrategy" class="strategy-select">
          <option value="fixed_size">字符滑动窗口</option>
          <option value="sentence">语义边界</option>
          <option value="markdown_header">Markdown标题</option>
          <option value="recursive">递归分块</option>
        </select>
        <router-link to="/chat" class="nav-link">💬 返回对话</router-link>
        <!-- 权限与多租户：仅 editor 及以上角色可上传文档 -->
        <label v-if="canUpload" class="upload-btn">上传文档<input type="file" accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg" @change="onUpload" style="display:none" multiple /></label>
      </div>
    </div>

    <div v-if="uploading" class="progress-bar">
      <div class="progress-text">{{ progress }}</div>
      <div class="progress-track"><div class="progress-fill" /></div>
    </div>
    <div v-if="uploadResult" class="upload-result" :class="{ fail: uploadResult.fail > 0 }">
      {{ uploadResult.msg }}
    </div>

    <div v-if="docs.length===0 && !uploading" class="empty">暂无文档</div>

    <table v-else class="doc-table">
      <thead>
        <tr><th>文件名</th><th>大小</th><th>页数</th><th>分块数</th><th>分块策略</th><th>上传者</th><th>上传时间</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="d in docs" :key="d.doc_id" @click="openDetail(d.doc_id)" class="doc-row">
          <td class="name-cell">{{ fileIcon(d.file_type) }} {{ d.filename }}</td>
          <td>{{ d.file_size || '-' }}</td>
          <td>{{ d.pages ?? '-' }}</td>
          <td>{{ d.chunks_count ?? '-' }}</td>
          <td>{{ strategyLabel(d.chunk_strategy) }}</td>
          <td>{{ d.uploaded_by || '-' }}</td>
          <td>{{ fmtTime(d.uploaded_at) }}</td>
          <td>
            <span v-if="canUpload" class="download-btn" @click.stop="downloadDoc(d.doc_id, d.filename)" title="下载">📥</span>
            <span v-if="canUpload" class="del-btn" @click.stop="remove(d.doc_id)">🗑</span>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Detail modal -->
    <div v-if="detail" class="modal-overlay" @click.self="detail=null">
      <div class="modal">
        <div class="modal-hd">
          <h3>📄 {{ detail.filename }}</h3>
          <span class="close" @click="detail=null">✕</span>
        </div>
        <div class="modal-body">
          <div class="meta-row"><span>格式</span><span>{{ detail.file_type || '-' }}</span></div>
          <div class="meta-row" v-if="detail.parser_used"><span>解析器</span><span>{{ detail.parser_used }}</span></div>
          <div class="meta-row"><span>大小</span><span>{{ detail.file_size }}</span></div>
          <div class="meta-row" v-if="detail.pages"><span>页数</span><span>{{ detail.pages }}</span></div>
          <div class="meta-row"><span>分块数</span><span>{{ detail.chunks_count }}</span></div>
          <div class="meta-row" v-if="detail.chunk_strategy"><span>分块策略</span><span>{{ strategyLabel(detail.chunk_strategy) }}</span></div>
          <div class="meta-row" v-if="detail.uploaded_by"><span>上传者</span><span>{{ detail.uploaded_by }}</span></div>
          <div class="meta-row"><span>上传时间</span><span>{{ detail.uploaded_at?.slice(0,19) }}</span></div>
          <div class="summary-box" v-if="detail.summary">
            <div class="summary-title">📝 AI 摘要</div>
            <div class="summary-text">{{ detail.summary }}</div>
          </div>
          <div class="chunks-box" v-if="detail.chunks?.length">
            <div class="summary-title">📖 内容预览</div>
            <div v-for="(c,i) in detail.chunks" :key="i" class="chunk-item">{{ c }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm replace dialog -->
    <div v-if="dupDialog.visible" class="modal-overlay" @click.self="dupDialog.visible=false">
      <div class="modal" style="width:420px">
        <div class="modal-hd">
          <h3>文件已存在</h3>
          <span class="close" @click="dupDialog.visible=false">✕</span>
        </div>
        <div class="modal-body" style="text-align:center">
          <p style="margin-bottom:20px;font-size:14px;color:#606266">
            「{{ dupDialog.filename }}」已经存在，确定要更新吗？
          </p>
          <div style="display:flex;gap:12px;justify-content:center">
            <button class="dialog-btn cancel" @click="dupDialog.visible=false; dupDialog.resolve?.(false)">取消</button>
            <button class="dialog-btn confirm" @click="dupDialog.visible=false; dupDialog.resolve?.(true)">确定</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import api from '../api'
import { useAuthStore } from '../stores/auth'

const docs = ref<any[]>([])
const detail = ref<any>(null)
const uploading = ref(false)
const progress = ref('')
const uploadResult = ref<{ok: number; fail: number; msg: string} | null>(null)
const chunkStrategy = ref('fixed_size')
const dupDialog = ref<{
  visible: boolean
  filename: string
  resolve: ((v: boolean) => void) | null
}>({ visible: false, filename: '', resolve: null })

function showDupDialog(filename: string): Promise<boolean> {
  return new Promise(resolve => {
    dupDialog.value = { visible: true, filename, resolve }
  })
}

async function load() {
  try { const r = await api.get('/documents'); docs.value = r.data.documents } catch {}
}
async function onUpload(e: Event) {
  const files = (e.target as HTMLInputElement).files; if (!files) return
  uploading.value = true; progress.value = ''; uploadResult.value = null
  let ok = 0; let fail = 0
  for (const f of Array.from(files)) {
    progress.value = `正在上传 ${f.name}...`
    try {
      // Pre-check: is this file already in the library?
      const check = await api.post('/upload/check', { filename: f.name, file_size: f.size })
      let url = `/api/upload/stream?strategy=${chunkStrategy.value}`
      if (check.data.exists) {
        const confirmed = await showDupDialog(check.data.filename)
        if (!confirmed) { continue }
        url += `&replace_doc_id=${check.data.doc_id}`
      }

      const token = localStorage.getItem('token')
      const resp = await fetch(url, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: (() => { const fd = new FormData(); fd.append('file', f); return fd })(),
      })
      const reader = resp.body?.getReader()
      const dec = new TextDecoder()
      let done = false
      while (reader && !done) {
        const { done: d, value } = await reader.read()
        if (d) break
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.step === 'done') {
                done = true
                if (data.status === 'no_text') { ok++; progress.value = data.msg || '没有识别到文字，已保存' }
                else if (data.status === 'parse_failed') { fail++; progress.value = data.msg || '解析失败' }
                else if (data.status === 'duplicate') { ok++; progress.value = data.msg || '文件已存在，跳过' }
                else { ok++; progress.value = data.msg || '上传完成' }
              }
              if (data.step === 'error') { fail++; done = true; progress.value = data.msg }
            } catch {}
          }
        }
      }
    } catch { fail++; progress.value = `${f.name} 上传失败` }
  }
  (e.target as HTMLInputElement).value = ''
  uploading.value = false
  uploadResult.value = { ok, fail, msg: `完成: ${ok} 成功, ${fail} 失败` }
  setTimeout(() => { uploadResult.value = null }, 5000)
  await load()
}
function downloadDoc(docId: string, filename: string) {
  const token = localStorage.getItem('token')
  const a = document.createElement('a')
  a.href = `/api/documents/${docId}/download`
  a.download = filename
  if (token) {
    // Use fetch + blob so we can send the auth header, then trigger download
    fetch(a.href, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error('download failed'); return r.blob() })
      .then(blob => { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url) })
      .catch(() => alert('下载失败'))
  }
}
async function remove(docId: string) {
  if (!confirm('确认删除此文档？')) return
  try { await api.delete(`/documents/${docId}`) } catch {}
  await load()
}
async function openDetail(docId: string) {
  try {
    const r = await api.get(`/documents/${docId}`)
    detail.value = r.data
  } catch {}
}
function fmtTime(t: string) { return t ? t.slice(0,16).replace('T',' ') : '-' }

const FILE_ICONS: Record<string, string> = {
  '.pdf': '📕', '.docx': '📘', '.doc': '📘', '.pptx': '📙', '.ppt': '📙',
  '.xlsx': '📗', '.xls': '📗', '.png': '🖼', '.jpg': '🖼', '.jpeg': '🖼',
  '.gif': '🖼', '.bmp': '🖼', '.webp': '🖼', '.txt': '📄', '.md': '📝',
  '.csv': '📊', '.html': '🌐', '.json': '📋', '.xml': '📋',
}
function fileIcon(ext: string) { return FILE_ICONS[ext?.toLowerCase()] || '📄' }

const STRATEGY_LABELS: Record<string, string> = {
  'fixed_size': '字符滑动窗口', 'sentence': '语义边界',
  'markdown_header': 'Markdown标题', 'recursive': '递归分块',
}
function strategyLabel(s: string) { return STRATEGY_LABELS[s] || s || '-' }

// 权限与多租户：计算上传权限
const auth = useAuthStore()
const canUpload = computed(() => ['super_admin', 'tenant_admin', 'editor'].includes(auth.role))

onMounted(load)
</script>

<style scoped>
.doc-page { max-width: 1000px; margin: 0 auto; padding: 64px 20px 20px; }
.top-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.top-bar h2 { font-size: 18px; }
.top-actions { display: flex; gap: 12px; align-items: center; }
.nav-link { color: #409eff; text-decoration: none; font-size: 14px; }
.upload-btn { padding: 6px 16px; background: #409eff; color: #fff; border-radius: 6px; cursor: pointer; font-size: 13px; }
.upload-btn:hover { background: #337ecc; }
.strategy-select { padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 13px; color: #606266; background: #fff; outline: none; cursor: pointer; }
.strategy-select:focus { border-color: #409eff; }
.progress-bar { margin-bottom: 16px; padding: 12px 16px; background: #ecf5ff; border-radius: 8px; }
.progress-text { font-size: 13px; color: #409eff; margin-bottom: 6px; }
.progress-track { height: 4px; background: #d9ecff; border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; width: 100%; background: #409eff; border-radius: 2px; animation: progressPulse 1.5s infinite; }
@keyframes progressPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
.upload-result { margin-bottom: 16px; padding: 10px 16px; background: #f0f9eb; color: #67c23a; border-radius: 8px; font-size: 13px; }
.upload-result.fail { background: #fef0f0; color: #f56c6c; }
.empty { text-align: center; color: #909399; padding: 60px 0; }
.doc-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; }
.doc-table th { background: #f5f7fa; padding: 10px 14px; text-align: left; font-size: 13px; color: #909399; }
.doc-table td { padding: 10px 14px; font-size: 14px; border-top: 1px solid #ebeef5; }
.doc-row { cursor: pointer; }
.doc-row:hover { background: #f5f7fa; }
.name-cell { font-weight: 500; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.download-btn { cursor: pointer; color: #c0c4cc; margin-right: 8px; }
.download-btn:hover { color: #409eff; }
.del-btn { cursor: pointer; color: #c0c4cc; }
.del-btn:hover { color: #f56c6c; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 12px; width: 640px; max-height: 80vh; overflow-y: auto; }
.modal-hd { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #ebeef5; }
.modal-hd h3 { font-size: 16px; }
.close { cursor: pointer; font-size: 18px; color: #909399; }
.modal-body { padding: 20px; }
.meta-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; color: #606266; border-bottom: 1px solid #f5f7fa; }
.summary-box { margin-top: 16px; padding: 12px; background: #f0f9eb; border-radius: 8px; }
.summary-title { font-weight: 600; font-size: 13px; margin-bottom: 6px; color: #67c23a; }
.summary-text { font-size: 14px; line-height: 1.7; color: #303133; }
.chunks-box { margin-top: 16px; }
.chunk-item { font-size: 13px; line-height: 1.6; color: #606266; padding: 8px 0; border-bottom: 1px solid #f0f0f0; white-space: pre-wrap; }
.dialog-btn { padding: 8px 28px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
.dialog-btn.cancel { background: #f5f7fa; color: #606266; }
.dialog-btn.cancel:hover { background: #e9ecef; }
.dialog-btn.confirm { background: #409eff; color: #fff; }
.dialog-btn.confirm:hover { background: #337ecc; }
</style>
