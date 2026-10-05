Future<T> withBrowserLock<T>(String name, Future<T> Function() action) =>
    action();
