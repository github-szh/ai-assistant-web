/** 权限与多租户：Pinia 认证状态管理 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const username = ref(localStorage.getItem('username') || '')
  const userId = ref(Number(localStorage.getItem('userId') || 0))
  const role = ref(localStorage.getItem('role') || 'viewer')
  const tenantId = ref(Number(localStorage.getItem('tenantId') || 0))
  const tenantName = ref(localStorage.getItem('tenantName') || '')

  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => role.value === 'super_admin' || role.value === 'tenant_admin')
  const isSuperAdmin = computed(() => role.value === 'super_admin')

  function login(data: {
    token: string; username: string; user_id: number
    role: string; tenant_id: number; tenant_name: string
  }) {
    token.value = data.token
    username.value = data.username
    userId.value = data.user_id
    role.value = data.role
    tenantId.value = data.tenant_id
    tenantName.value = data.tenant_name

    localStorage.setItem('token', data.token)
    localStorage.setItem('username', data.username)
    localStorage.setItem('userId', String(data.user_id))
    localStorage.setItem('role', data.role)
    localStorage.setItem('tenantId', String(data.tenant_id))
    localStorage.setItem('tenantName', data.tenant_name)
  }

  function logout() {
    token.value = ''
    username.value = ''
    userId.value = 0
    role.value = 'viewer'
    tenantId.value = 0
    tenantName.value = ''
    localStorage.clear()
  }

  return { token, username, userId, role, tenantId, tenantName, isLoggedIn, isAdmin, isSuperAdmin, login, logout }
})
