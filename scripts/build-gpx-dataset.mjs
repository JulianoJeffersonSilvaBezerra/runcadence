import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GPX_DIR = path.join(ROOT, 'gpx');
const OUTPUT_JSON = path.join(ROOT, 'src', 'data', 'gpx-metrics.json');
const OUTPUT_SQL = path.join(ROOT, 'supabase', 'seed_gpx_runs.sql');

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function parseTrackPoints(xml) {
  const points = [];
  const pointRegex = /<trkpt\b[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  let match = pointRegex.exec(xml);

  while (match) {
    const lat = Number.parseFloat(match[1]);
    const lon = Number.parseFloat(match[2]);
    const block = match[3] || '';

    const eleMatch = block.match(/<ele>([^<]+)<\/ele>/);
    const timeMatch = block.match(/<time>([^<]+)<\/time>/);
    const cadMatch = block.match(/<gpxtpx:cad>([^<]+)<\/gpxtpx:cad>/);

    points.push({
      lat,
      lon,
      ele: eleMatch ? Number.parseFloat(eleMatch[1]) : null,
      time: timeMatch ? timeMatch[1] : null,
      cadence: cadMatch ? Number.parseFloat(cadMatch[1]) : null,
    });

    match = pointRegex.exec(xml);
  }

  return points;
}

function computeMetrics(fileName, xml) {
  const metadataTimeMatch = xml.match(/<metadata>[\s\S]*?<time>([^<]+)<\/time>[\s\S]*?<\/metadata>/);
  const trackNameMatch = xml.match(/<trk>[\s\S]*?<name>([\s\S]*?)<\/name>/);
  const trackTypeMatch = xml.match(/<trk>[\s\S]*?<type>([^<]+)<\/type>/);

  const points = parseTrackPoints(xml);
  if (points.length < 2) return null;

  let totalDistanceM = 0;
  let totalMovingSeconds = 0;
  let maxSpeedMs = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;

  let minEle = Number.POSITIVE_INFINITY;
  let maxEle = Number.NEGATIVE_INFINITY;

  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;

  let cadenceCount = 0;
  let cadenceSum = 0;
  let cadenceMax = 0;

  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];

    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);

    if (Number.isFinite(p.ele)) {
      minEle = Math.min(minEle, p.ele);
      maxEle = Math.max(maxEle, p.ele);
    }

    if (Number.isFinite(p.cadence) && p.cadence > 0) {
      cadenceCount += 1;
      cadenceSum += p.cadence;
      cadenceMax = Math.max(cadenceMax, p.cadence);
    }

    if (i === 0) continue;

    const prev = points[i - 1];
    const segmentM = haversineMeters(prev.lat, prev.lon, p.lat, p.lon);
    if (segmentM > 0) {
      totalDistanceM += segmentM;
    }

    if (prev.time && p.time) {
      const dt = (Date.parse(p.time) - Date.parse(prev.time)) / 1000;
      if (Number.isFinite(dt) && dt > 0 && dt <= 30) {
        const speedMs = segmentM / dt;
        maxSpeedMs = Math.max(maxSpeedMs, speedMs);
        if (speedMs >= 0.7) {
          totalMovingSeconds += dt;
        }
      }
    }

    if (Number.isFinite(prev.ele) && Number.isFinite(p.ele)) {
      const diff = p.ele - prev.ele;
      if (diff > 0) elevationGainM += diff;
      if (diff < 0) elevationLossM += Math.abs(diff);
    }
  }

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const startedAt = firstPoint.time || (metadataTimeMatch ? metadataTimeMatch[1] : null);
  const endedAt = lastPoint.time || startedAt;

  const durationSeconds = startedAt && endedAt
    ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000))
    : 0;

  const distanceKm = totalDistanceM / 1000;
  const avgPace = distanceKm > 0 ? (durationSeconds / 60) / distanceKm : 0;
  const avgSpeedKmh = durationSeconds > 0 ? (distanceKm / (durationSeconds / 3600)) : 0;

  const runName = (trackNameMatch ? trackNameMatch[1] : path.basename(fileName, '.gpx')).replace(/\s+/g, ' ').trim();
  const runType = trackTypeMatch ? trackTypeMatch[1].trim().toLowerCase() : 'running';

  const startedDate = startedAt ? new Date(startedAt) : null;
  const date = startedDate ? startedDate.toISOString().slice(0, 10) : null;

  return {
    runKey: path.basename(fileName, '.gpx'),
    fileName,
    runName,
    runType,
    startedAt,
    endedAt,
    date,
    durationSeconds,
    movingSeconds: Math.round(totalMovingSeconds),
    distanceKm: round(distanceKm, 3),
    averagePaceMinKm: round(avgPace, 3),
    averageSpeedKmh: round(avgSpeedKmh, 3),
    maxSpeedKmh: round(maxSpeedMs * 3.6, 3),
    elevationGainM: round(elevationGainM, 1),
    elevationLossM: round(elevationLossM, 1),
    minElevationM: Number.isFinite(minEle) ? round(minEle, 1) : null,
    maxElevationM: Number.isFinite(maxEle) ? round(maxEle, 1) : null,
    pointCount: points.length,
    avgCadenceSpm: cadenceCount > 0 ? round(cadenceSum / cadenceCount, 1) : null,
    maxCadenceSpm: cadenceCount > 0 ? Math.round(cadenceMax) : null,
    bbox: {
      minLat: round(minLat, 7),
      minLon: round(minLon, 7),
      maxLat: round(maxLat, 7),
      maxLon: round(maxLon, 7),
    },
  };
}

function summarizeRuns(runs) {
  const validRuns = runs.filter((run) => run.distanceKm > 0 && run.durationSeconds > 0);

  const totalRuns = validRuns.length;
  const totalDistanceKm = round(validRuns.reduce((sum, run) => sum + run.distanceKm, 0), 2);
  const totalDurationSeconds = validRuns.reduce((sum, run) => sum + run.durationSeconds, 0);
  const totalMovingSeconds = validRuns.reduce((sum, run) => sum + run.movingSeconds, 0);
  const totalElevationGainM = round(validRuns.reduce((sum, run) => sum + run.elevationGainM, 0), 1);

  const averageDistanceKm = totalRuns > 0 ? round(totalDistanceKm / totalRuns, 2) : 0;
  const averagePaceMinKm = totalDistanceKm > 0
    ? round((totalDurationSeconds / 60) / totalDistanceKm, 3)
    : 0;

  const fastestRun = [...validRuns].sort((a, b) => a.averagePaceMinKm - b.averagePaceMinKm)[0] || null;
  const longestRun = [...validRuns].sort((a, b) => b.distanceKm - a.distanceKm)[0] || null;
  const biggestElevationRun = [...validRuns].sort((a, b) => b.elevationGainM - a.elevationGainM)[0] || null;

  const dailyMap = new Map();
  const weeklyMap = new Map();

  for (const run of validRuns) {
    if (run.date) {
      const dayEntry = dailyMap.get(run.date) || { date: run.date, runs: 0, distanceKm: 0, durationSeconds: 0 };
      dayEntry.runs += 1;
      dayEntry.distanceKm += run.distanceKm;
      dayEntry.durationSeconds += run.durationSeconds;
      dailyMap.set(run.date, dayEntry);

      const weekKey = isoWeekKey(new Date(run.startedAt));
      const weekEntry = weeklyMap.get(weekKey) || { week: weekKey, runs: 0, distanceKm: 0, durationSeconds: 0 };
      weekEntry.runs += 1;
      weekEntry.distanceKm += run.distanceKm;
      weekEntry.durationSeconds += run.durationSeconds;
      weeklyMap.set(weekKey, weekEntry);
    }
  }

  const daily = [...dailyMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({
      ...entry,
      distanceKm: round(entry.distanceKm, 3),
      avgPaceMinKm: entry.distanceKm > 0 ? round((entry.durationSeconds / 60) / entry.distanceKm, 3) : 0,
    }));

  const weekly = [...weeklyMap.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((entry) => ({
      ...entry,
      distanceKm: round(entry.distanceKm, 3),
      avgPaceMinKm: entry.distanceKm > 0 ? round((entry.durationSeconds / 60) / entry.distanceKm, 3) : 0,
    }));

  return {
    generatedAt: new Date().toISOString(),
    totalRuns,
    totalDistanceKm,
    totalDurationSeconds,
    totalMovingSeconds,
    totalElevationGainM,
    averageDistanceKm,
    averagePaceMinKm,
    fastestRun,
    longestRun,
    biggestElevationRun,
    daily,
    weekly,
  };
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildSeedSql(runs) {
  const lines = [];
  lines.push('-- Auto-generated by scripts/build-gpx-dataset.mjs');
  lines.push(`-- Generated at: ${new Date().toISOString()}`);
  lines.push('');

  for (const run of runs) {
    const bbox = JSON.stringify(run.bbox);
    lines.push(
      'insert into public.gpx_runs (' +
      'run_key, file_name, run_name, run_type, source, started_at, ended_at, date_local, duration_seconds, moving_seconds, distance_km, avg_pace_min_km, avg_speed_kmh, max_speed_kmh, elevation_gain_m, elevation_loss_m, min_elevation_m, max_elevation_m, point_count, avg_cadence_spm, max_cadence_spm, bbox' +
      ') values (' +
      [
        sqlValue(run.runKey),
        sqlValue(run.fileName),
        sqlValue(run.runName),
        sqlValue(run.runType),
        sqlValue('gpx_import'),
        sqlValue(run.startedAt),
        sqlValue(run.endedAt),
        sqlValue(run.date),
        sqlValue(run.durationSeconds),
        sqlValue(run.movingSeconds),
        sqlValue(run.distanceKm),
        sqlValue(run.averagePaceMinKm),
        sqlValue(run.averageSpeedKmh),
        sqlValue(run.maxSpeedKmh),
        sqlValue(run.elevationGainM),
        sqlValue(run.elevationLossM),
        sqlValue(run.minElevationM),
        sqlValue(run.maxElevationM),
        sqlValue(run.pointCount),
        sqlValue(run.avgCadenceSpm),
        sqlValue(run.maxCadenceSpm),
        `${sqlValue(bbox)}::jsonb`,
      ].join(', ') +
      ') on conflict (run_key) do update set ' +
      'file_name = excluded.file_name, run_name = excluded.run_name, run_type = excluded.run_type, source = excluded.source, started_at = excluded.started_at, ended_at = excluded.ended_at, date_local = excluded.date_local, duration_seconds = excluded.duration_seconds, moving_seconds = excluded.moving_seconds, distance_km = excluded.distance_km, avg_pace_min_km = excluded.avg_pace_min_km, avg_speed_kmh = excluded.avg_speed_kmh, max_speed_kmh = excluded.max_speed_kmh, elevation_gain_m = excluded.elevation_gain_m, elevation_loss_m = excluded.elevation_loss_m, min_elevation_m = excluded.min_elevation_m, max_elevation_m = excluded.max_elevation_m, point_count = excluded.point_count, avg_cadence_spm = excluded.avg_cadence_spm, max_cadence_spm = excluded.max_cadence_spm, bbox = excluded.bbox, updated_at = now();'
    );
  }

  lines.push('');
  return lines.join('\n');
}

async function main() {
  const files = (await fs.readdir(GPX_DIR))
    .filter((name) => name.toLowerCase().endsWith('.gpx'))
    .sort((a, b) => a.localeCompare(b));

  const runs = [];
  for (const fileName of files) {
    const fullPath = path.join(GPX_DIR, fileName);
    const xml = await fs.readFile(fullPath, 'utf8');
    const metrics = computeMetrics(fileName, xml);
    if (metrics) runs.push(metrics);
  }

  runs.sort((a, b) => {
    if (!a.startedAt && !b.startedAt) return a.fileName.localeCompare(b.fileName);
    if (!a.startedAt) return 1;
    if (!b.startedAt) return -1;
    return a.startedAt.localeCompare(b.startedAt);
  });

  const output = {
    metadata: summarizeRuns(runs),
    runs,
  };

  await fs.writeFile(OUTPUT_JSON, JSON.stringify(output, null, 2));
  await fs.writeFile(OUTPUT_SQL, buildSeedSql(runs));

  console.log(`GPX processados: ${runs.length}`);
  console.log(`Dataset JSON: ${OUTPUT_JSON}`);
  console.log(`Seed SQL: ${OUTPUT_SQL}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
