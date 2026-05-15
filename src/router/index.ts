import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/chat' },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
    { path: '/chat', name: 'chat', component: () => import('../views/ChatView.vue'), meta: { auth: true } },
    { path: '/documents', name: 'documents', component: () => import('../views/DocumentsView.vue'), meta: { auth: true } },
  ],
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.auth && !token) next('/login')
  else next()
})

export default router
