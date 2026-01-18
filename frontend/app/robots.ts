import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const baseUrl = 'https://saharycloud.com'; // Update with your actual domain

    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/api/',
                    '/admin/',
                    '/settings/',
                    '/profile/',
                    '/vms/*/console',
                    '/debug/',
                ],
            },
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
    };
}
