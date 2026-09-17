import stations from "../data/stations.json";
import type { Station } from "./types";

export const STATIONS = stations as Station[];

export function findStation(name: string) {
  return STATIONS.find((station) => station.name === name) ?? null;
}
