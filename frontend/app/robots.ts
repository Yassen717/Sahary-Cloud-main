import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://saharycloud.com';

    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/api',
                    '/admin',
                    '/dashboard',
                    '/vms',
                    '/billing',
                    '/solar',
                    '/settings',
                    '/profile',
                    '/debug',
                    '/test-api',
                    '/simple',
                ],
            },
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
    };
}
