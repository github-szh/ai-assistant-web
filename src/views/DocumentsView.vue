<template>
  <div class="doc-page">
    <div class="top-bar">
      <h2>📁 文档管理</h2>
      <div class="top-actions">
        <router-link to="/chat" class="nav-link">💬 返回对话</router-link>
        <label class="upload-btn">上传文档<input type="file" accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg" @change="onUpload" style="display:none" multiple /></label>
      </div>
    </div>

    <div v-if="docs.length===0" class="empty">暂无文档</div>

    <table v-else class="doc-table">
      <thead>
        <tr><th>文件名</th><th>格式</th><th>大小</th><th>上传时间</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="d in docs" :key="d.doc_id" @click="openDetail(d.doc_id)" class="doc-row">
          <td class="name-cell">📄 {{ d.filename }}</td>
          <td>{{ d.file_type || d.parser_used }}</td>
          <td>{{ d.file_size || '-' }}</td>
          <td>{{ fmtTime(d.uploaded_at) }}</td>
          <td><span class="del-btn" @click.stop="remove(d.doc_id)">🗑</span></td>
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
          <div class="meta-row"><span>格式</span><span>{{ detail.file_type || detail.parser_used }}</span></div>
          <div class="meta-row"><span>大小</span><span>{{ detail.file_size }}</span></div>
          <div class="meta-row" v-if="detail.pages"><span>页数</span><span>{{ detail.pages }}</span></div>
          <div class="meta-row"><span>分块数</span><span>{{ detail.chunks_count }}</span></div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../api'

const docs = ref<any[]>([])
const detail = ref<any>(null)

async function load() {
  try { const r = await api.get('/documents'); docs.value = r.data.documents } catch {}
}
async function onUpload(e: Event) {
  const files = (e.target as HTMLInputElement).files; if (!files) return
  for (const f of Array.from(files)) {
    const form = new FormData(); form.append('file', f)
    try { await api.post('/upload', form) } catch {}
  }
  await load()
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

onMounted(load)
</script>

<style scoped>
.doc-page { max-width: 1000px; margin: 0 auto; padding: 20px; }
.top-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.top-bar h2 { font-size: 18px; }
.top-actions { display: flex; gap: 12px; align-items: center; }
.nav-link { color: #409eff; text-decoration: none; font-size: 14px; }
.upload-btn { padding: 6px 16px; background: #409eff; color: #fff; border-radius: 6px; cursor: pointer; font-size: 13px; }
.upload-btn:hover { background: #337ecc; }
.empty { text-align: center; color: #909399; padding: 60px 0; }
.doc-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; }
.doc-table th { background: #f5f7fa; padding: 10px 14px; text-align: left; font-size: 13px; color: #909399; }
.doc-table td { padding: 10px 14px; font-size: 14px; border-top: 1px solid #ebeef5; }
.doc-row { cursor: pointer; }
.doc-row:hover { background: #f5f7fa; }
.name-cell { font-weight: 500; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
</style>
