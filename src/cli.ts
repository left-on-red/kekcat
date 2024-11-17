import { program } from 'commander';
import chroma, { type InterpolationMode } from 'chroma-js';
import { getFrameColorizer, createStream } from './index';
import { version } from './../package.json';

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

const INTERPOLATION_MODES = ['rgb', 'hsl', 'hsv', 'hsi', 'lab', 'oklab', 'lch', 'oklch', 'hcl', 'lrgb'];

program
	.version(version, '-v, --version')
	.option('-m, --mode <mode>', 'color interpolation mode (how colors are blended)', 'lrgb')
	.option('-s, --step <number>', 'color increment step', 0.3 as any)
	.option('-t, --stagger <number>', 'incremental horizontal offset on each line. offset = stagger * step', 1 as any)
	.option('-r, --seed [seed]', 'RNG seed. no RNG by default, leave blank for random seed')
	.option('-c, --stops <color...>')
	.option('-a, --animate', 'enable psychedelics')
	.option('-p, --speed <number>', 'animation speed', 20.0 as any)
	.option('-f, --force', 'force true RGB colors. only use when colors are not working correctly', false)
	.parse();

const opts = program.opts();

function fail(error: string) {
	console.log(error);
	process.exit(1);
}

const mode = (opts.mode as string).toLowerCase() as InterpolationMode;
const step = parseFloat(opts.step);
const stagger = parseInt(opts.stagger);
const seed = opts.seed === undefined ? null : typeof opts.seed === 'boolean' ? undefined : opts.seed as string;
const stops: string[] = opts.stops === undefined ? ['f00','f0f', '00f', '0ff', '0f0', 'ff0'] : opts.stops;
const animate: boolean = opts.animate;
const speed = parseFloat(opts.speed);
const forceTrueRGB: boolean = opts.force;

if (!INTERPOLATION_MODES.includes(mode)) fail(`invalid interpolation mode: "${mode}"`);
if (isNaN(step)) fail(`invalid step: "${opts.step}"`);
if (isNaN(stagger)) fail(`invalid stagger: "${opts.stagger}"`);
stops.forEach(x => !chroma.valid(x) ? fail(`invalid color: "${x}"`) : undefined);
if (animate && isNaN(speed) || speed <= 0) fail(`invalid speed: "${opts.speed}"`);

const colorize = getFrameColorizer({
	mode,
	step,
	stagger,
	seed,
	stops,
	forceTrueRGB,
});

if (animate) {
	let frame = '';
	process.stdin.on('data', (line: string) => frame += line + '\n');
	process.stdin.on('close', async () => {
		while (true) {
			process.stdout.write('\x1b[3J\x1b[2J\x1b[1J');
			console.clear();
			process.stdout.cursorTo(0);
			process.stdout.write(colorize(frame));
			await sleep((1 / speed) * 500);
		}
	});
} else {
	createStream(process.stdin, colorize).pipe(process.stdout);
}