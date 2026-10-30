// Route rehearsal (ref/06 §Route bot): the active level's route (main = 500 m world, TEST-20b; slice via ?level=slice,
// TEST-20a) from spawn to victory with vitexec mouse/keyboard only.
import { runRoute } from '/vitexec/lib/route-bot.ts'
import type { Route } from '/vitexec/lib/route-bot.ts'
import { currentLevelId, loadLevel } from '/src/level/levels.ts'
import sliceRoute from '/vitexec/routes/slice.json'
import mainRoute from '/vitexec/routes/main.json'

const id = currentLevelId()
const route = (id === 'slice' ? sliceRoute : mainRoute) as unknown as Route
await runRoute(route, loadLevel(id).data.platforms, 'rehearsal', id === 'slice' ? '20a' : '20b')
