/** 权限与多租户：路由配置，增加角色守卫和管理页面 */
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/chat' },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
    { path: '/register', name: 'register', component: () => import('../views/RegisterView.vue') },
    { path: '/chat', name: 'chat', component: () => import('../views/ChatView.vue'), meta: { auth: true } },
    { path: '/documents', name: 'documents', component: () => import('../views/DocumentsView.vue'), meta: { auth: true, role: ['super_admin', 'tenant_admin', 'editor'] } },
    { path: '/monitoring', name: 'monitoring', component: () => import('../views/MonitoringView.vue'), meta: { auth: true, role: ['super_admin', 'tenant_admin'] } },
    { path: '/eval', name: 'eval', component: () => import('../views/EvalView.vue'), meta: { auth: true } },
    // 权限与多租户：管理后台路由，仅 admin 角色可访问
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
      meta: { auth: true, role: ['super_admin', 'tenant_admin'] },
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.auth && !token) {
    next('/login')
    return
  }
  // 权限与多租户：角色路由守卫
  if (to.meta.role) {
    const role = localStorage.getItem('role')
    const roles = to.meta.role as string[]
    if (!role || !roles.includes(role)) {
      next('/chat')  // 无权限则跳转到聊天页
      return
    }
  }
  next()
})

export default router
