import { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        component: () => import('pages/IndexPage.vue'),
        name: 'index',
        meta: { requiresAuth: true },
      },
    ],
  },

  {
    path: '/login',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        component: () => import('pages/AuthPage.vue'),
        name: 'login',
        meta: { requiresAuth: true },
      },
    ],
  },

  {
    path: '/robot/parameters',
    meta: { requiresAuth: true },
    component: () => import('layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        component: () => import('pages/RobotParametersPage.vue'),
        name: 'parameters',
        meta: { requiresAuth: true },
      },
    ],
  },

  {
    path: '/robot/mapping',
    name: 'mapping',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        component: () => import('pages/MappingPage.vue'),
        name: 'mapping',
        meta: { requiresAuth: true },
      },
    ],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;
