<template>
  <div class="login-page">
    <div class="login-card">
      <h1>AI Assistant</h1>
      <p class="sub">登录以继续</p>
      <input v-model="username" class="field" placeholder="用户名" @keydown.enter="login" />
      <input v-model="password" class="field" type="password" placeholder="密码" @keydown.enter="login" />
      <button class="btn" :disabled="loading" @click="login">{{ loading ? '登录中...' : '登 录' }}</button>
      <p v-if="err" class="err">{{ err }}</p>
      <p class="link">没有账号？<router-link to="/register">去注册</router-link></p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()
const username = ref('')
const password = ref('')
const loading = ref(false)
const err = ref('')
let errTimer: ReturnType<typeof setTimeout> | null = null

function clearErr() {
  if (errTimer) { clearTimeout(errTimer); errTimer = null }
  err.value = ''
}

watch([username, password], () => { if (err.value) clearErr() })

onUnmounted(() => { if (errTimer) clearTimeout(errTimer) })

async function login() {
  if (!username.value || !password.value) return
  loading.value = true; clearErr()
  try {
    const res = await api.post('/auth/login', { username: username.value, password: password.value })
    // 权限与多租户：保存角色和租户信息
    auth.login({
      token: res.data.token,
      username: res.data.username,
      user_id: res.data.user_id,
      role: res.data.role || 'viewer',
      tenant_id: res.data.tenant_id,
      tenant_name: res.data.tenant_name || '',
    })
    router.push('/chat')
  } catch (e: any) {
    err.value = e.response?.data?.detail || '登录失败'
    errTimer = setTimeout(() => { err.value = '' }, 5000)
  }
  loading.value = false
}
</script>

<style scoped>
.login-page { height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg,#667eea,#764ba2); }
.login-card { background: #fff; padding: 40px 36px; border-radius: 12px; width: 360px; box-shadow: 0 10px 40px rgba(0,0,0,.15); text-align: center; }
h1 { font-size: 22px; margin-bottom: 4px; }
.sub { color: #909399; font-size: 14px; margin-bottom: 24px; }
.field { display: block; width: 100%; padding: 10px 12px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 14px; margin-bottom: 12px; outline: none; }
.field:focus { border-color: #409eff; }
.btn { width: 100%; padding: 10px; background: #409eff; color: #fff; border: none; border-radius: 6px; font-size: 15px; cursor: pointer; }
.btn:hover { background: #337ecc; }
.btn:disabled { background: #a0cfff; cursor: not-allowed; }
.err { color: #f56c6c; margin-top: 12px; font-size: 13px; }
.link { margin-top: 16px; font-size: 13px; color: #909399; }
.link a { color: #409eff; text-decoration: none; }
.link a:hover { text-decoration: underline; }
</style>
