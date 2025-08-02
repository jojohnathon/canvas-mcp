(function(global) {
  const logger = {
    info: (...args) => console.log(...args),
    error: (...args) => console.error(...args),
    warn: (...args) => console.warn(...args)
  };
  global.logger = logger;
})(window);
