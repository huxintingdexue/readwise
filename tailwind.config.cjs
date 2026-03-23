module.exports = {
  content: [
    './frontend/index.html',
    './frontend/js/**/*.js'
  ],
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {
      colors: {
        surface: '#f8f9fa',
        onSurface: '#2d3335',
        primary: '#006b62',
        outline: '#adb3b5'
      },
      fontFamily: {
        headline: [
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'Noto Sans SC',
          'sans-serif'
        ],
        body: [
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'Noto Sans SC',
          'sans-serif'
        ]
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries')
  ]
};
