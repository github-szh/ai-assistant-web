<template>
  <div class="admin-page">
    <div class="admin-top">
      <h2>⚙️ 系统管理</h2>
      <router-link to="/chat" class="nav-link">💬 返回对话</router-link>
    </div>

    <!-- Tab 切换 -->
    <div class="tabs">
      <span class="tab" :class="{ on: tab === 'users' }" @click="tab = 'users'">👥 用户管理</span>
      <span v-if="auth.isSuperAdmin" class="tab" :class="{ on: tab === 'tenants' }" @click="tab = 'tenants'">🏢 租户管理</span>
      <span class="tab" :class="{ on: tab === 'settings' }" @click="tab = 'settings'">🔧 系统设置</span>
    </div>

    <!-- 用户管理 -->
    <div v-if="tab === 'users'" class="tab-content">
      <table class="admin-table">
        <thead>
          <tr><th>ID</th><th>用户名</th><th>显示名</th><th>角色</th><th>状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.id }}</td>
            <td>{{ u.username }}</td>
            <td>{{ u.display_name }}</td>
            <td>
              <select v-model="u.role" @change="updateRole(u)" :disabled="u.id === auth.userId">
                <option value="viewer">查看者</option>
                <option value="editor">编辑者</option>
                <option value="tenant_admin">管理员</option>
              </select>
            </td>
            <td>
              <span :class="u.is_active ? 'active' : 'inactive'">{{ u.is_active ? '正常' : '已禁用' }}</span>
            </td>
            <td>
              <button class="btn-sm" @click="toggleActive(u)" :disabled="u.id === auth.userId">
                {{ u.is_active ? '禁用' : '启用' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="err" class="err">{{ err }}</p>
    </div>

    <!-- 租户管理 -->
    <div v-if="tab === 'tenants'" class="tab-content">
      <div class="create-tenant">
        <input v-model="newTenant.name" placeholder="租户名称" class="field" />
        <input v-model="newTenant.code" placeholder="租户编码" class="field" />
        <button class="btn" @click="createTenant">创建租户</button>
      </div>
      <table class="admin-table">
        <thead>
          <tr><th>ID</th><th>名称</th><th>编码</th><th>状态</th><th>创建时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="t in tenants" :key="t.id">
            <td>{{ t.id }}</td>
            <td>{{ t.name }}</td>
            <td>{{ t.code }}</td>
            <td>
              <span :class="t.is_active ? 'active' : 'inactive'">{{ t.is_active ? '正常' : '已禁用' }}</span>
            </td>
            <td>{{ fmtTime(t.created_at) }}</td>
            <td>
              <button class="btn-sm" @click="toggleTenant(t)">
                {{ t.is_active ? '禁用' : '启用' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 系统设置 -->
    <div v-if="tab === 'settings'" class="tab-content">
      <div class="settings-grid">
        <div class="setting-item">
          <span class="setting-label">LLM 提供商</span>
          <span class="setting-value">{{ settings.llm_provider }}</span>
        </div>
        <div class="setting-item">
          <span class="setting-label">嵌入模型</span>
          <span class="setting-value">{{ settings.embedding_provider }}</span>
        </div>
        <div class="setting-item">
          <span class="setting-label">质检开关</span>
          <span class="setting-value">{{ settings.quality_guard_enabled ? '已开启' : '已关闭' }}</span>
        </div>
        <div class="setting-item">
          <span class="setting-label">检索模式</span>
          <span class="setting-value">{{ settings.retrieval_mode }}</span>
        </div>
        <div class="setting-item">
          <span class="setting-label">切片策略</span>
          <span class="setting-value">{{ settings.chunk_strategy }}</span>
        </div>
        <div class="setting-item">
          <span class="setting-label">重排序</span>
          <span class="setting-value">{{ settings.rerank_enabled ? '已开启' : '已关闭' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const tab = ref('users')
const users = ref<any[]>([])
const tenants = ref<any[]>([])
const settings = ref<any>({})
const err = ref('')
const newTenant = ref({ name: '', code: '' })

async function loadUsers() {
  try { const r = await api.get('/admin/users'); users.value = r.data.users } catch { err.value = '加载用户失败' }
}
async function loadTenants() {
  try { const r = await api.get('/admin/tenants'); tenants.value = r.data.tenants } catch {}
}
async function loadSettings() {
  try { const r = await api.get('/admin/settings'); settings.value = r.data } catch {}
}

async function updateRole(u: any) {
  const prevRole = u.role
  try {
    await api.patch(`/admin/users/${u.id}/role`, { user_id: u.id, role: u.role })
    err.value = ''
  } catch (e: any) {
    u.role = prevRole  // 回滚
    err.value = e.response?.data?.detail || '更新角色失败'
  }
}

async function toggleActive(u: any) {
  try {
    const r = await api.patch(`/admin/users/${u.id}/toggle-active`)
    u.is_active = r.data.is_active
  } catch (e: any) { err.value = e.response?.data?.detail || '操作失败' }
}

async function createTenant() {
  if (!newTenant.value.name || !newTenant.value.code) return
  try {
    await api.post('/admin/tenants', newTenant.value)
    newTenant.value = { name: '', code: '' }
    await loadTenants()
  } catch (e: any) { err.value = e.response?.data?.detail || '创建失败' }
}

async function toggleTenant(t: any) {
  try {
    const r = await api.patch(`/admin/tenants/${t.id}`, { is_active: !t.is_active })
    t.is_active = r.data.is_active !== undefined ? r.data.is_active : !t.is_active
  } catch (e: any) {
    err.value = e.response?.data?.detail || '操作失败'
  }
}

function fmtTime(t: string) { return t ? t.slice(0, 16).replace('T', ' ') : '-' }

onMounted(() => { loadUsers(); loadTenants(); loadSettings() })
</script>

<style scoped>
.admin-page { max-width: 1000px; margin: 0 auto; padding: 20px; }
.admin-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.admin-top h2 { font-size: 18px; }
.nav-link { color: #409eff; text-decoration: none; font-size: 14px; }
.tabs { display: flex; gap: 0; border-bottom: 2px solid #e4e7ed; margin-bottom: 20px; }
.tab { padding: 8px 20px; cursor: pointer; font-size: 14px; color: #909399; border-bottom: 2px solid transparent; margin-bottom: -2px; }
.tab.on { color: #409eff; border-bottom-color: #409eff; font-weight: 600; }
.admin-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; }
.admin-table th { background: #f5f7fa; padding: 10px 14px; text-align: left; font-size: 13px; color: #909399; }
.admin-table td { padding: 10px 14px; font-size: 14px; border-top: 1px solid #ebeef5; }
.admin-table tr:hover { background: #f5f7fa; }
.active { color: #67c23a; font-weight: 500; }
.inactive { color: #f56c6c; font-weight: 500; }
.btn-sm { padding: 4px 12px; background: #409eff; color: #fff; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; }
.btn-sm:hover { background: #337ecc; }
.btn-sm:disabled { background: #a0cfff; cursor: not-allowed; }
.field { padding: 8px 12px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 14px; outline: none; }
.field:focus { border-color: #409eff; }
.btn { padding: 8px 20px; background: #409eff; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
.btn:hover { background: #337ecc; }
.create-tenant { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
.tab-content { }
.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.setting-item { background: #fff; padding: 16px; border-radius: 8px; border: 1px solid #ebeef5; }
.setting-label { display: block; font-size: 12px; color: #909399; margin-bottom: 4px; }
.setting-value { font-size: 16px; font-weight: 500; color: #303133; }
.err { color: #f56c6c; margin-top: 12px; font-size: 13px; }
</style>
