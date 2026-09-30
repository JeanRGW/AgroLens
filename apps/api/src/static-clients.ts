import type { ServeStaticModuleOptions } from '@nestjs/serve-static';

export function staticClientOptions(
  webDistPath: string,
  mobileWebDistPath?: string,
): ServeStaticModuleOptions[] {
  const mobile: ServeStaticModuleOptions[] = mobileWebDistPath
    ? [
        {
          rootPath: mobileWebDistPath,
          serveRoot: '/m',
          serveStaticOptions: {
            fallthrough: true,
            setHeaders: (response) => {
              // Flutter assets have stable names; revalidate between releases.
              response.setHeader('Cache-Control', 'no-cache');
            },
          },
        },
      ]
    : [];

  // The root SPA fallback must run after the more specific Flutter mount.
  return [
    ...mobile,
    {
      rootPath: webDistPath,
      exclude: ['/api', '/api/{*path}', '/docs', '/docs/{*path}', '/m', '/m/{*path}'],
      serveStaticOptions: {
        fallthrough: true,
        setHeaders: (response, filePath) => {
          if (filePath.endsWith('/index.html')) {
            response.setHeader('Cache-Control', 'no-cache');
            return;
          }
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      },
    },
  ];
}
