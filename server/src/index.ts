import express from 'express'
import path from 'node:path'
import { PORT } from './config'
import { apiRouter } from './routes'

// Le front est construit par `npm run build` (vite build) dans <racine>/dist.
// `npm start` est toujours lancé depuis la racine du projet.
const webDist = path.resolve(process.cwd(), 'dist')

const app = express()

// Montées avant le middleware de secours ci-dessous, sinon il les intercepterait toutes.
app.use('/api', apiRouter)

app.use(express.static(webDist))

// Route de secours : sert index.html pour toute navigation front qui n'est pas un fichier statique.
// (middleware générique plutôt qu'un wildcard de route : Express 5/path-to-regexp@8 exige un
// nom pour les wildcards de route, ex. '/*splat', ce qu'un simple '*' ne fournit plus.)
app.use((_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`sohub-claude-visualizer écoute sur http://localhost:${PORT}`)
})
