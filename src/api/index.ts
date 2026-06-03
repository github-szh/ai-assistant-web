/** 权限与多租户：API 客户端，支持角色和租户信息 */
import axios from 'axios'

const api = axios.create({ baseURL: '/api', timeout: 120000 })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.clear()
      window.location.href = '/login'
    }
    // 权限与多租户：403 权限不足，可统一处理
    if (err.response?.status === 403) {
      console.warn('权限不足:', err.response?.data?.detail)
    }
    return Promise.reject(err)
  },
)

export default api
