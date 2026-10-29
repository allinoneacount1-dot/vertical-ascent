// TEST-20a play (frozen copy of vitexec/rehearsal.ts, ref/06 §Route bot): slice route from spawn to victory with vitexec mouse/keyboard only.
import { runRoute } from '/vitexec/lib/route-bot.ts'
import type { Route } from '/vitexec/lib/route-bot.ts'
import route from '/vitexec/routes/slice.json'
import level from '/level/slice.json'

await runRoute(route as unknown as Route, (level as unknown as { platforms: never[] }).platforms, 'play')
