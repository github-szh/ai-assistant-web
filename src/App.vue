<template>
  <div class="app">
    <!-- Global top bar (hidden on login/register) -->
    <header v-if="showTopBar" class="global-topbar">
      <router-link to="/chat" class="topbar-logo">🏠 {{ pageTitle }}</router-link>
      <div class="topbar-user">
        <span class="topbar-item">👤 {{ auth.username }}</span>
        <span class="topbar-role">{{ roleLabel }}</span>
        <span class="topbar-item">🏢 {{ auth.tenantName || '无租户' }}</span>
        <span class="topbar-logout" @click="logout">🚪 退出</span>
      </div>
    </header>
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'

const route = useRoute()
const auth = useAuthStore()

const showTopBar = computed(() => {
  return !['login', 'register'].includes(route.name as string)
})

const titles: Record<string, string> = {
  chat: 'AI Chat',
  documents: '知识库管理',
  monitoring: '监控与成本',
  admin: '用户和租户',
}
const pageTitle = computed(() => titles[route.name as string] || 'AI Chat')

const roleLabels: Record<string, string> = {
  super_admin: '超级管理员',
  tenant_admin: '管理员',
  editor: '编辑员',
  viewer: '普通用户',
}
const roleLabel = computed(() => roleLabels[auth.role] || auth.role)

function logout() {
  auth.logout()
  window.location.href = '/login'
}
</script>

<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#f0f2f5;color:#303133}
.app{min-height:100vh}
.global-topbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px; height: 44px; background: #2c2c2c;
  border-bottom: 1px solid #3a3a3a; font-size: 13px;
}
.topbar-logo { font-weight: 700; font-size: 15px; color: #fff; text-decoration: none; }
.topbar-logo:hover { color: #409eff; }
.topbar-user { display: flex; align-items: center; gap: 12px; }
.topbar-item { color: #ccc; }
.topbar-role {
  display: inline-block; padding: 1px 8px; border-radius: 10px;
  font-size: 11px; background: rgba(64,158,255,.2); color: #409eff; font-weight: 500;
}
.topbar-logout { cursor: pointer; color: #c0c4cc; font-size: 14px; }
.topbar-logout:hover { color: #f56c6c; }
</style>
