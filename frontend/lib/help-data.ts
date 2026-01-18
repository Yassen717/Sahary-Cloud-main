// Help center FAQ data
export interface FAQ {
    id: string;
    question: string;
    answer: string;
    category: 'getting-started' | 'vms' | 'solar' | 'billing' | 'account';
    relatedLinks?: { title: string; href: string }[];
}

export const faqs: FAQ[] = [
    // Getting Started
    {
        id: 'gs-1',
        category: 'getting-started',
        question: 'How do I get started with Sahary Cloud?',
        answer: 'Getting started is easy! First, create an account by clicking "Sign Up" in the navigation. Once registered, you can access your dashboard where you can create your first VM, monitor solar production, and manage billing. We recommend starting with our Basic plan to test the platform.',
        relatedLinks: [
            { title: 'Create Your First VM', href: '/help#first-vm' },
            { title: 'View Pricing Plans', href: '/#plans' },
        ]
    },
    {
        id: 'gs-2',
        category: 'getting-started',
        question: 'What makes Sahary Cloud different from other hosting providers?',
        answer: 'Sahary Cloud is the first 100% solar-powered cloud hosting provider in Libya. Our infrastructure runs entirely on renewable energy, reducing CO2 emissions by over 95% compared to traditional data centers. You get reliable VPS hosting while contributing to environmental sustainability.',
    },
    {
        id: 'gs-3',
        category: 'getting-started',
        question: 'Do I need technical knowledge to use Sahary Cloud?',
        answer: 'While having technical knowledge helps, our platform is designed to be user-friendly. We provide a visual dashboard for managing VMs, automatic backups, and one-click deployments for popular applications. Our support team is also available 24/7 to help you with any questions.',
    },

    // Virtual Machines
    {
        id: 'vm-1',
        category: 'vms',
        question: 'How do I create a new virtual machine?',
        answer: 'To create a VM, go to your Dashboard and click "Create VM" or navigate to the VMs page. Select your desired specifications (CPU, RAM, storage), choose an operating system, and select a pricing plan. Your VM will be ready in minutes. You can access it via SSH or our web-based console.',
        relatedLinks: [
            { title: 'VM Management Guide', href: '/help#vm-guide' },
            { title: 'Available OS Images', href: '/help#os-images' },
        ]
    },
    {
        id: 'vm-2',
        category: 'vms',
        question: 'Can I upgrade or downgrade my VM resources?',
        answer: 'Yes! You can resize your VM at any time from the VM details page. Click "Resize" and select new specifications. The VM will be temporarily stopped during the resize process (usually 2-5 minutes). You will be charged based on the new specifications from the moment of the change.',
    },
    {
        id: 'vm-3',
        category: 'vms',
        question: 'What happens if solar power is unavailable?',
        answer: 'Our infrastructure includes advanced battery storage systems that provide 24/7 reliability. We maintain 99.9% uptime through a combination of battery reserves and redundant power systems. Your VMs will continue running even during nighttime or cloudy conditions.',
    },
    {
        id: 'vm-4',
        category: 'vms',
        question: 'How do I access my VM?',
        answer: 'You can access your VM via SSH using the credentials provided during creation. We also offer a web-based console accessible directly from your dashboard. For Windows VMs, RDP access is available.',
    },
    {
        id: 'vm-5',
        category: 'vms',
        question: 'Are backups included?',
        answer: 'Automatic daily backups are included with all plans. Backups are retained for 7 days on Basic plan, 14 days on Pro plan, and 30 days on Enterprise plan. You can also create manual snapshots at any time.',
    },

    // Solar Monitoring
    {
        id: 'solar-1',
        category: 'solar',
        question: 'How can I monitor solar energy production?',
        answer: 'The Solar Dashboard shows real-time solar production, battery levels, system efficiency, and environmental impact metrics. You can view daily and monthly production charts, CO2 savings, and receive alerts for any system issues.',
        relatedLinks: [
            { title: 'Solar Dashboard', href: '/solar' },
            { title: 'Environmental Impact', href: '/solar#impact' },
        ]
    },
    {
        id: 'solar-2',
        category: 'solar',
        question: 'What are solar credits and how do they work?',
        answer: 'Solar credits are earned when our system produces more energy than consumed. These credits can be applied to your bill, effectively reducing your hosting costs during high production periods. Credits are calculated automatically and shown in your billing dashboard.',
    },
    {
        id: 'solar-3',
        category: 'solar',
        question: 'Will I receive alerts about solar system status?',
        answer: 'Yes! You can configure alerts in the Solar Alerts page. We notify you about low battery levels, production anomalies, maintenance schedules, and emergency situations. Alerts can be delivered via email, SMS, or push notifications.',
        relatedLinks: [
            { title: 'Configure Alerts', href: '/solar-alerts' },
        ]
    },

    // Billing
    {
        id: 'billing-1',
        category: 'billing',
        question: 'How does billing work?',
        answer: 'We bill hourly for VM usage, calculated at the end of each month. You only pay for the time your VMs are running. View detailed usage breakdown in the Billing dashboard, including CPU hours, storage, and bandwidth consumption.',
        relatedLinks: [
            { title: 'Billing Dashboard', href: '/billing' },
            { title: 'Usage Tracking', href: '/billing/usage' },
        ]
    },
    {
        id: 'billing-2',
        category: 'billing',
        question: 'What payment methods do you accept?',
        answer: 'We accept major credit cards (Visa, Mastercard, American Express), bank transfers, and cryptocurrency payments. For enterprise customers, we can arrange invoicing and custom payment terms.',
    },
    {
        id: 'billing-3',
        category: 'billing',
        question: 'Can I see an estimate of my monthly costs?',
        answer: 'Yes! The Usage Tracking page shows predicted monthly costs based on current usage. You can also set budget alerts to notify you when spending reaches certain thresholds.',
    },
    {
        id: 'billing-4',
        category: 'billing',
        question: 'Is there a free trial available?',
        answer: 'New customers receive $10 in free credits upon signup, enough to run a Basic VM for approximately 30 days. No credit card required for the trial period.',
    },

    // Account & Security
    {
        id: 'account-1',
        category: 'account',
        question: 'How do I reset my password?',
        answer: 'Click "Forgot Password" on the login page and enter your email address. We\'ll send you a secure link to reset your password. For security, the link expires after 1 hour.',
    },
    {
        id: 'account-2',
        category: 'account',
        question: 'Can I enable two-factor authentication (2FA)?',
        answer: 'Yes! We highly recommend enabling 2FA for additional security. Go to Settings > Security and enable two-factor authentication. You can use apps like Google Authenticator or Authy.',
        relatedLinks: [
            { title: 'Security Settings', href: '/settings#security' },
        ]
    },
    {
        id: 'account-3',
        category: 'account',
        question: 'How do I update my profile information?',
        answer: 'Navigate to your Profile page from the user menu in the header. You can update your name, email, phone number, and notification preferences. Changes are saved immediately.',
        relatedLinks: [
            { title: 'Edit Profile', href: '/profile' },
        ]
    },
    {
        id: 'account-4',
        category: 'account',
        question: 'How do I delete my account?',
        answer: 'To delete your account, go to Settings > Account and scroll to the "Danger Zone". Please note that deleting your account will permanently remove all your VMs, data, and billing history. This action cannot be undone.',
    },
];

export const faqCategories = [
    {
        id: 'getting-started',
        title: 'Getting Started',
        description: 'Learn the basics of Sahary Cloud',
        icon: 'Rocket',
    },
    {
        id: 'vms',
        title: 'Virtual Machines',
        description: 'Creating and managing VMs',
        icon: 'Server',
    },
    {
        id: 'solar',
        title: 'Solar Monitoring',
        description: 'Understanding your solar dashboard',
        icon: 'Sun',
    },
    {
        id: 'billing',
        title: 'Billing & Pricing',
        description: 'Payment and invoicing questions',
        icon: 'CreditCard',
    },
    {
        id: 'account',
        title: 'Account & Security',
        description: 'Managing your account settings',
        icon: 'Shield',
    },
] as const;
