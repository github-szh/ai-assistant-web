<template>
  <div class="login-page">
    <div class="login-card">
      <h1>AI Assistant</h1>
      <p class="sub">登录以继续</p>
      <input v-model="username" class="field" placeholder="用户名" @keydown.enter="login" />
      <input v-model="password" class="field" type="password" placeholder="密码" @keydown.enter="login" />
      <button class="btn" :disabled="loading" @click="login">{{ loading ? '登录中...' : '登 录' }}</button>
      <p v-if="err" class="err">{{ err }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'

const router = useRouter()
const username = ref('')
const password = ref('')
const loading = ref(false)
const err = ref('')

async function login() {
  if (!username.value || !password.value) return
  loading.value = true; err.value = ''
  try {
    const res = await api.post('/auth/login', { username: username.value, password: password.value })
    localStorage.setItem('token', res.data.token)
    localStorage.setItem('username', res.data.username)
    localStorage.setItem('userId', res.data.user_id)
    router.push('/chat')
  } catch (e: any) {
    err.value = e.response?.data?.detail || '登录失败'
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
</style>
