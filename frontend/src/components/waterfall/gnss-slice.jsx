/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

import { createSlice } from '@reduxjs/toolkit';

function toFiniteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function getGnssFixStatusFromOutput(output) {
    const normalizedOutput = output || {};
    const backendFixStatus = String(normalizedOutput.gnss_fix_status || '').trim().toUpperCase();
    if (backendFixStatus === 'FIX' || backendFixStatus === 'NO FIX') {
        // Prefer backend-derived state when available so fix acquire/loss semantics stay centralized.
        return backendFixStatus;
    }

    const eventType = String(normalizedOutput.event || '').toLowerCase();
    const latitude = toFiniteNumber(normalizedOutput.latitude);
    const longitude = toFiniteNumber(normalizedOutput.longitude);
    const hasCoords = latitude !== null && longitude !== null;
    const hasPvtField = normalizedOutput.has_pvt !== undefined && normalizedOutput.has_pvt !== null;
    const hasPvt = hasPvtField ? Boolean(normalizedOutput.has_pvt) : null;
    const hasFixQualityField = normalizedOutput.fix_quality !== undefined
        && normalizedOutput.fix_quality !== null
        && String(normalizedOutput.fix_quality).trim() !== '';
    const hasFixQuality = hasFixQualityField && String(normalizedOutput.fix_quality).trim() !== '0';
    const isNmea = eventType === 'nmea' || eventType === 'nmea_gga' || eventType === 'nmea_rmc';
    const isFixSignal = hasCoords || hasFixQualityField || hasPvtField || isNmea;

    if (!isFixSignal) {
        return null;
    }
    return (hasCoords || hasFixQuality || hasPvt) ? 'FIX' : 'NO FIX';
}

const initialState = {
    decodedInsightsActiveTab: 'packets',
    gnssSatellitesSortModel: [{ field: 'satelliteId', sort: 'asc' }],
    // Runtime GNSS lifecycle for the decoded island summary.
    gnssFixLifecycle: {
        currentStatus: 'NO DATA',
        currentFixStartedAtMs: null,
        lastFixAcquiredAtMs: null,
        lastFixLostAtMs: null,
        lastFixDurationMs: null,
        lastSignalAtMs: null,
    },
};

export const gnssSlice = createSlice({
    name: 'gnssState',
    initialState,
    reducers: {
        setDecodedInsightsActiveTab: (state, action) => {
            state.decodedInsightsActiveTab = action.payload === 'gnss' ? 'gnss' : 'packets';
        },
        setGnssSatellitesSortModel: (state, action) => {
            state.gnssSatellitesSortModel = action.payload;
        },
        updateGnssFixLifecycleFromOutput: (state, action) => {
            const payload = action.payload || {};
            if (payload.decoder_type !== 'gnss') {
                return;
            }

            const timestampMs = Number(payload.timestamp) * 1000;
            if (!Number.isFinite(timestampMs)) {
                return;
            }

            const derivedStatus = getGnssFixStatusFromOutput(payload.output || {});
            if (!derivedStatus) {
                return;
            }

            const lifecycle = state.gnssFixLifecycle;
            lifecycle.lastSignalAtMs = timestampMs;

            if (derivedStatus === lifecycle.currentStatus) {
                return;
            }

            if (derivedStatus === 'FIX') {
                lifecycle.currentStatus = 'FIX';
                lifecycle.currentFixStartedAtMs = timestampMs;
                lifecycle.lastFixAcquiredAtMs = timestampMs;
                return;
            }

            if (lifecycle.currentStatus === 'FIX' && lifecycle.currentFixStartedAtMs !== null) {
                lifecycle.lastFixDurationMs = Math.max(0, timestampMs - lifecycle.currentFixStartedAtMs);
            }
            lifecycle.currentStatus = 'NO FIX';
            lifecycle.currentFixStartedAtMs = null;
            lifecycle.lastFixLostAtMs = timestampMs;
        },
    },
});

export const {
    setDecodedInsightsActiveTab,
    setGnssSatellitesSortModel,
    updateGnssFixLifecycleFromOutput,
} = gnssSlice.actions;

export default gnssSlice.reducer;
