// CSS is served under /base in Karma; emitted font URLs are rooted at /media.
module.exports = config => config.set({
  frameworks: ['jasmine'],
  plugins: ['karma-jasmine', 'karma-chrome-launcher', 'karma-jasmine-html-reporter', 'karma-coverage'],
  reporters: ['progress'],
  browsers: ['ChromeHeadless'],
  proxies: { '/base/media/': '/media/' },
  restartOnFileChange: true,
});
