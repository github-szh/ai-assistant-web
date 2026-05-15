<template>
  <div class="doc-page">
    <div class="top-bar">
      <h2>📁 文档管理</h2>
      <div class="top-actions">
        <router-link to="/chat" class="nav-link">💬 返回对话</router-link>
        <label class="upload-btn">上传文档<input type="file" accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg" @change="onUpload" style="display:none" multiple /></label>
      </div>
    </div>

    <div v-if="docs.length===0" class="empty">暂无文档，点击"上传文档"导入</div>

    <div class="card-grid">
      <div v-for="d in docs" :key="d.doc_id" class="card">
        <div class="card-icon">📄</div>
        <div class="card-info">
          <div class="card-name">{{ d.filename }}</div>
          <div class="card-meta">{{ d.parser_used }} · {{ d.chunks_count || 0 }} chunks · {{ d.status }}</div>
        </div>
        <span class="card-del" @click="remove(d.doc_id)">🗑</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../api'

const docs = ref<any[]>([])

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
.card-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(280px,1fr)); gap: 12px; }
.card { display: flex; align-items: center; gap: 12px; background: #fff; padding: 14px 16px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.card-icon { font-size: 28px; }
.card-info { flex: 1; min-width: 0; }
.card-name { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-meta { font-size: 12px; color: #909399; margin-top: 2px; }
.card-del { cursor: pointer; font-size: 16px; color: #c0c4cc; }
.card-del:hover { color: #f56c6c; }
</style>
