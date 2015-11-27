module.exports = {
  ioc: require('./hooks/IocHook'),
  errorHandlers: {
    api: require('./hooks/ApiErrorHandlerHook'),
    mvc: require('./hooks/MvcErrorHandlerHook')
  }
};
