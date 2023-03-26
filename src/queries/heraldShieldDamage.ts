import { ReportDataReportArgs, Query, ReportEventsArgs, EventDataType, ReportActor } from "../__generated__/graphql-types"
import { graphClient } from '../graphQLClient';
import { gql } from 'graphql-request';
import { DamageEvent } from '../types';
import { combinePlayerAndPetDamage } from "../calculations";

export const getOneHeraldEvents = async (reportArgs: ReportDataReportArgs, eventArgs: ReportEventsArgs, heraldInstanceId: number): Promise<DamageEvent[]> => {
    eventArgs.targetInstanceID = heraldInstanceId;
    const data = await graphClient.request<Query>(gql`
        query ($code: String, $fightIDs: [Int], $targetID: Int, $targetInstanceID: Int) {
            reportData {
                report(code: $code) {
                    events(fightIDs: $fightIDs, targetID: $targetID, targetInstanceID: $targetInstanceID, dataType: DamageDone, limit: 1000) {
                        nextPageTimestamp, 
                        data
                    }
                }
            }
        }
    `, { ...reportArgs, ...eventArgs });

    const eventsData = data.reportData.report.events.data as DamageEvent[]
    if (eventsData.length == 0) {
        return [];
    }
    return eventsData.filter(x => x.absorbed != null && x.absorbed > 0);
}

const getHeraldEventMap = async (code, fightId, heraldId): Promise<Map<number, DamageEvent[]>> => {
    const reportArgs: ReportDataReportArgs = { code };
    const eventArgs: ReportEventsArgs = { fightIDs: [fightId], dataType: EventDataType.DamageDone, targetID: heraldId };

    const heraldEventMap = new Map<number, DamageEvent[]>();
    for (var i = 1; i <= 3; i++) {
        heraldEventMap.set(i, (await getOneHeraldEvents(reportArgs, eventArgs, i)))
    }
    return heraldEventMap;
}

export const sendHeraldEvents = async (reportCode: string, pullId: number, actors: ReportActor[], sendFunction: (title: string, message: string) => void) => {
    const events = await getHeraldEventMap(reportCode, pullId, actors.find(x => x.name === "Flamesworn Herald").id)
    const absorbfunc = (e: DamageEvent) => e.absorbed
    const mappedValues = [
        combinePlayerAndPetDamage(actors, events.get(1), absorbfunc),
        combinePlayerAndPetDamage(actors, events.get(2), absorbfunc),
        combinePlayerAndPetDamage(actors, events.get(3), absorbfunc)
    ]

    for (var i = 0; i < 3; i++) {
        const message = Array.from(mappedValues[i].entries())
            .map(x => `${x[0].padEnd(12, " ")} - ${x[1]} \n`)
            .join('')
        const title = `[report ${reportCode}, pull ${pullId}] - herald ${i + 1} shield damage`
        sendFunction(title, message)
    }
}
