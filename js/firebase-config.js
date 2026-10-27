/*
 * Firebaseの接続設定(Firebaseコンソール → プロジェクトの設定 → マイアプリ で確認できる)
 * この値は秘密情報ではなく、公開しても問題ない。
 * データの保護は Firestore のセキュリティルール(本人のデータだけ読み書きできる)で行っている。
 */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDSGVarfXGXPWF9Akfpno514V40d2mnwlE',
  authDomain: 'shukatsu-schedule.firebaseapp.com',
  projectId: 'shukatsu-schedule',
  storageBucket: 'shukatsu-schedule.firebasestorage.app',
  messagingSenderId: '360347285259',
  appId: '1:360347285259:web:5afb4053c25c39ae8a540e'
};
