/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./web/index.html', './web/src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      // Thème HUD « Centre de commande » (contrat C1) : fond quasi noir, accents cyan/ambre/vert,
      // filets nets. Vocabulaire partagé par toute l'app — voir web/src/style.css pour les
      // classes utilitaires qui s'appuient dessus.
      colors: {
        hud: {
          // Palette du contrat C1 — fait autorité, les composants migrent progressivement vers
          // ces noms.
          bg: '#04070a', // fond de page
          panel: 'rgba(8, 17, 24, .82)', // fond des panneaux et cartes
          line: 'rgba(77, 227, 255, .2)', // filet standard (bordures, séparateurs)
          cyan: '#4de3ff', // accent principal : liens, éléments actifs, focus, halo
          'cyan-soft': '#9df1ff', // survol, valeur mise en avant
          amber: '#ffb64d', // statut "à l'arrêt" / intervention requise
          green: '#5ef2a0', // statut "terminée"
          red: '#ff6b5f', // statut "en attente" (waiting) : question ou permission bloquante
          grey: '#6c8794', // texte tertiaire discret
          text: '#cfe9f2', // texte courant
          'text-strong': '#e4f6fc', // titres, valeurs mises en avant
          soft: '#8fb2c0', // texte secondaire
          muted: '#5f8494', // libellés HUD, texte tertiaire
          dim: '#3f6273', // texte le plus discret (horodatages, décor)

          // Alias du lot 0005 : anciens noms `hud-*`, conservés le temps que les composants
          // migrent vers la palette ci-dessus, mappés vers la valeur la plus proche du contrat
          // C1 (ou une valeur tirée de la maquette quand aucun équivalent direct n'existe).
          950: '#04070a', // ~ hud-bg
          900: 'rgba(8, 17, 24, .82)', // ~ hud-panel
          800: 'rgba(12, 25, 34, .92)', // ~ survol de carte (maquette)
          700: 'rgba(16, 34, 46, .95)', // approximation : pas d'équivalent "surface active" au contrat
          'line-strong': 'rgba(77, 227, 255, .35)', // ~ bordure accentuée (tiroir de détail)
        },
        // Accent cyan et ses variantes d'état.
        accent: {
          DEFAULT: '#22d3ee', // accent principal : liens, éléments actifs, focus, halo
          dim: '#3b82a0', // texte/icône secondaire sur fond sombre, libellés HUD
          bright: '#7ee6fb', // survol, valeur mise en avant
          muted: '#0b2e3a', // fond teinté très sombre (badge, chip, hover discret)
        },
        // Couleurs sémantiques des trois statuts d'agent (jamais de 4e état "échec").
        status: {
          running: '#22d3ee', // en cours
          done: '#34d399', // terminée
          idle: '#64748b', // inactive depuis N min
        },
      },
      fontFamily: {
        // Titres, libellés de sections et données d'en-tête (contrat C1).
        display: ['Rajdhani', 'ui-sans-serif', 'sans-serif'],
        // Toutes les données chiffrées : tokens, durées, dates, identifiants, libellés HUD.
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        // Texte d'interface courant, pile système.
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        // Halo cyan discret : à réserver aux éléments actifs/focus, jamais permanent partout.
        glow: '0 0 0 1px rgba(34, 211, 238, 0.25), 0 0 16px rgba(34, 211, 238, 0.35)',
        'glow-sm': '0 0 0 1px rgba(34, 211, 238, 0.2), 0 0 8px rgba(34, 211, 238, 0.25)',
        // Halo hud-red discret : une carte de session `waiting` doit se remarquer d'un coup
        // d'œil sans crier « échec » — posé sur un calque dédié (aria-hidden), jamais sur un
        // élément qui porte du contenu.
        'glow-red': '0 0 0 1px rgba(255, 107, 95, 0.3), 0 0 14px rgba(255, 107, 95, 0.35)',
      },
      // Animations HUD (contrat C1) : keyframes exacts repris de
      // .sohub-claude-plugin/maquette/maquette-template.html. `jsweep` n'apparaît pas ici :
      // aucun composant n'utilise la classe utilitaire `animate-jsweep`, `.hud-sweep` (voir
      // web/src/style.css) le référence directement en CSS brut — pas de raison de dupliquer
      // un keyframe que Tailwind n'a jamais à émettre.
      animation: {
        jpulse: 'jpulse 1.6s ease-in-out infinite',
        jspin: 'jspin 9s linear infinite',
        jblink: 'jblink 1.1s steps(1, end) infinite',
      },
      keyframes: {
        jpulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '.35', transform: 'scale(.7)' },
        },
        jspin: {
          to: { transform: 'rotate(360deg)' },
        },
        jblink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.15' },
        },
      },
    },
  },
  plugins: [],
}
