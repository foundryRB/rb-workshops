import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import { mermaidConfig } from '@psa-department-of-engineering/starlight-theme';

// base derives from DOCS_BASE so the site mounts under the portal prefix
// (/apps/rb-workshops); the Dockerfile places the built files under the same prefix
// because Astro's output is flat (INT-FOUNDRY-018, ADR-023).
export default defineConfig({
    base: process.env.DOCS_BASE || '/',
    integrations: [
        // Must precede starlight so it transforms ```mermaid blocks before
        // expressive-code renders them as code.
        mermaid({ autoTheme: true, mermaidConfig }),
        starlight({
            title: 'RB Workshops',
            components: { SiteTitle: './src/components/SiteTitle.astro' },
            description: 'The workshops engine: typed working-session instruments, authored, run and exported.',
            customCss: ['@psa-department-of-engineering/starlight-theme/styles.css', './src/styles/rb.css'],
            head: [
                {
                    tag: 'link',
                    attrs: { rel: 'icon', href: `${process.env.DOCS_BASE || '/'}favicon.svg`, type: 'image/svg+xml' },
                },
            ],
            sidebar: [
                { label: 'Start here', items: ['index', 'brand'] },
                { label: 'Modules', items: [{ autogenerate: { directory: 'modules' } }] },
                { label: 'Flows', items: [{ autogenerate: { directory: 'flows' } }] },
                { label: 'Operations', items: [{ autogenerate: { directory: 'operations' } }] },
                { label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
                { label: 'Decisions', items: [{ autogenerate: { directory: 'decisions' } }] },
                { label: 'Glossary', items: ['glossary'] },
            ],
        }),
        mdx(),
    ],
});
