import { useCallback } from "react";
import { invokeRedisPipeline } from "@/lib/api.ts";

interface PipelineResult {
    outputs: any[];
}

export function useRedisDatabases() {
    const fetchRedisDatabases = useCallback(async (connectionId: number) => {
        const result = await invokeRedisPipeline<PipelineResult>({
            connectionId,
            commands: [
                { command: "INFO", args: ["keyspace"] },
                { command: "CONFIG", args: ["GET", "databases"] },
            ],
            db: 0,
        });

        const [infoOutput, configOutput] = result.outputs;
        const parsedDbs: string[] = [];
        const newKeysCount: Record<string, number> = {};

        const parseInfo = (infoString: string) => {
            const lines = infoString.split("\n");
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("db")) continue;

                const colonIdx = trimmed.indexOf(":");
                if (colonIdx === -1) continue;

                const dbStr = trimmed.substring(2, colonIdx);
                const statsMatch = trimmed.match(/keys=(\d+)/);
                if (!statsMatch) continue;

                parsedDbs.push(dbStr);
                newKeysCount[dbStr] = parseInt(statsMatch[1], 10);
            }
        };

        let infoStr = "";
        if (typeof infoOutput === "string") {
            infoStr = infoOutput;
        } else if (Array.isArray(infoOutput) && typeof infoOutput[0] === "string") {
            infoStr = infoOutput[0];
        }

        if (infoStr) {
            parseInfo(infoStr);
        }

        let totalDatabases = 16;
        if (Array.isArray(configOutput) && configOutput.length >= 2) {
            totalDatabases = parseInt(configOutput[1], 10) || 16;
        }

        const dbsWithKeys = new Set(parsedDbs);
        const dbsWithoutKeys: string[] = [];

        for (let i = 0; i < totalDatabases; i++) {
            const dbStr = String(i);
            if (!dbsWithKeys.has(dbStr)) {
                dbsWithoutKeys.push(dbStr);
                newKeysCount[dbStr] = 0;
            }
        }

        return {
            databases: [...parsedDbs, ...dbsWithoutKeys],
            keysCount: newKeysCount,
        };
    }, []);

    return { fetchRedisDatabases };
}
