// One-off probe: does vitexec --path select the DEV test level? Not evidence.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 200 && (window as any).__game?.state !== 'MENU'; i++) await sleep(100)
console.log('level-param ' + JSON.stringify({ search: location.search, level: (window as any).__game.level, bvh: Object.keys((window as any).__game.bvh.buildMs) }))
