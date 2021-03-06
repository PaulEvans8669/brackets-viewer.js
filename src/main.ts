import './style.scss';
import { Participant, Match, MatchResults, ParticipantResult, StageType } from 'brackets-model';
import { splitBy, getRanking } from './helpers';
import * as dom from './dom';
import * as lang from './lang';

class BracketsViewer {

    readonly teamRefsDOM: { [key: number]: HTMLElement[] } = {};
    private participants!: Participant[];
    private config!: Config;

    public render(rootSelector: string, data: ViewerData, config?: Partial<Config>) {
        const root = document.querySelector(rootSelector) as HTMLElement;
        if (!root) throw Error('Root not found. You must have a root element with id "root"');

        this.config = {
            participantOriginPlacement: config && config.participantOriginPlacement || 'before',
            showSlotsOrigin: config && config.showSlotsOrigin !== undefined ? config.showSlotsOrigin : true,
            showLowerBracketSlotsOrigin: config && config.showLowerBracketSlotsOrigin !== undefined ? config.showLowerBracketSlotsOrigin : true,
            highlightParticipantOnHover: config && config.highlightParticipantOnHover !== undefined ? config.highlightParticipantOnHover : true,
        };

        this.participants = data.participants;
        data.participants.forEach(participant => this.teamRefsDOM[participant.id] = []);

        const matchesByGroup = splitBy(data.matches, 'group_id');

        switch (data.stage.type) {
            case 'round_robin':
                this.renderRoundRobin(root, data.stage.name, matchesByGroup);
                break;
            case 'single_elimination':
            case 'double_elimination':
                this.renderElimination(root, data.stage.name, data.stage.type, matchesByGroup);
                break;
            default:
                throw Error(`Unknown bracket type: ${data.stage.type}`);
        }
    }

    private renderRoundRobin(root: HTMLElement, stageName: string, matchesByGroup: Match[][]) {
        const container = dom.createRoundRobinContainer();

        let groupNumber = 1;

        for (const groupMatches of matchesByGroup) {
            const groupContainer = dom.createGroupContainer(lang.getGroupName(groupNumber++));
            const matchesByRound = splitBy(groupMatches, 'round_id');

            let roundNumber = 1;

            for (const roundMatches of matchesByRound) {
                const roundContainer = dom.createRoundContainer(lang.getRoundName(roundNumber++));

                for (const match of roundMatches)
                    roundContainer.append(this.createMatch(match));

                groupContainer.append(roundContainer);
            }

            groupContainer.append(this.createRanking(groupMatches));
            container.append(groupContainer);
        }

        root.append(dom.createTitle(stageName), container);
    }

    private renderElimination(root: HTMLElement, stageName: string, type: StageType, matchesByGroup: Match[][]) {
        root.append(dom.createTitle(stageName));

        if (type === 'single_elimination')
            return this.renderSingleElimination(root, matchesByGroup);

        this.renderDoubleElimination(root, matchesByGroup);
    }

    private renderSingleElimination(root: HTMLElement, matchesByGroup: Match[][]) {
        const hasFinal = matchesByGroup[1] !== undefined;
        this.renderBracket(root, splitBy(matchesByGroup[0], 'round_id'), lang.getRoundName);

        if (hasFinal)
            this.renderFinal('consolation_final', matchesByGroup[1]);
    }

    private renderDoubleElimination(root: HTMLElement, matchesByGroup: Match[][]) {
        const hasFinal = matchesByGroup[2] !== undefined;
        this.renderBracket(root, splitBy(matchesByGroup[0], 'round_id'), lang.getWinnerBracketRoundName, false, hasFinal);
        this.renderBracket(root, splitBy(matchesByGroup[1], 'round_id'), lang.getLoserBracketRoundName, true);

        if (hasFinal)
            this.renderFinal('grand_final', matchesByGroup[2]);
    }

    /**
     * Renders a bracket.
     */
    private renderBracket(root: HTMLElement, matchesByRound: Match[][], roundName: (roundNumber: number) => string, inLowerBracket?: boolean, connectFinal?: boolean) {
        const bracketContainer = dom.createBracketContainer();
        const roundCount = matchesByRound.length;

        let roundNumber = 1;

        for (const matches of matchesByRound) {
            const roundContainer = dom.createRoundContainer(roundName(roundNumber));

            for (const match of matches)
                roundContainer.append(this.createBracketMatch(roundNumber, matchesByRound, match, roundCount, inLowerBracket, connectFinal));

            bracketContainer.append(roundContainer);
            roundNumber++;
        }

        root.append(bracketContainer);
    }

    private renderFinal(type: FinalType, matches: Match[]) {
        const upperBracket = document.querySelector('.bracket');
        if (!upperBracket) throw Error('Upper bracket not found.');

        const grandFinalName = lang.getGrandFinalName(matches);

        const winnerWb =  matches[0].opponent1;
        const finalsToDisplay = (winnerWb && winnerWb.id != null && winnerWb.result != "win") ? 2 : 1;

        const finalMatches = matches.slice(0, finalsToDisplay);
        for (let i = 0; i < finalMatches.length; i++) {
            const roundContainer = dom.createRoundContainer(lang.getFinalMatchLabel(type, grandFinalName, i));
            roundContainer.append(this.createFinalMatch(type, grandFinalName, finalMatches, i));
            upperBracket.append(roundContainer);
        }
    }

    private createRanking(matches: Match[]) {
        const table = dom.createTable();
        const ranking = getRanking(matches);

        table.append(dom.createHeaders(ranking));

        for (const item of ranking)
            table.append(this.createRankingItem(item));

        return table;
    }

    private createRankingItem(item: RankingItem) {
        const row = dom.createRow();

        for (const prop in item) {
            let data: number | string = item[prop];

            if (prop === 'id') {
                const participant = this.participants.find(team => team.id === data);

                if (participant !== undefined) {
                    const cell = dom.createCell(participant.name);
                    this.setupMouseHover(participant.id, cell);
                    row.append(cell);
                    continue;
                }
            }

            row.append(dom.createCell(data));
        }

        return row;
    }

    private createBracketMatch(roundNumber: number, matchesByRound: Match[][], match: Match, roundCount: number, inLowerBracket?: boolean, connectFinal?: boolean) {
        const connection = dom.getBracketConnection(roundNumber, matchesByRound, inLowerBracket, connectFinal);
        const matchLabel = lang.getMatchLabel(match, roundNumber, roundCount, inLowerBracket);
        const matchHint = lang.getMatchHint(roundNumber, roundCount, inLowerBracket);
        return this.createMatch(match, connection, matchLabel, matchHint, inLowerBracket);
    }

    private createFinalMatch(type: string, grandFinalName: (i: number) => string, matches: Match[], i: number) {
        const connection = dom.getFinalConnection(type, i, matches);
        const matchLabel = lang.getFinalMatchLabel(type, grandFinalName, i);
        const matchHint = lang.getFinalMatchHint(type, i);

        return this.createMatch(matches[i], connection, matchLabel, matchHint);
    }

    private createMatch(results: MatchResults, connection?: Connection, label?: string, hint?: MatchHint, inLowerBracket?: boolean) {
        inLowerBracket = inLowerBracket || false;

        const match = dom.createMatchContainer();
        const teams = dom.createTeamsContainer();

        const team1 = this.createTeam(results.opponent1, hint, inLowerBracket);
        const team2 = this.createTeam(results.opponent2, hint, inLowerBracket);

        if (label)
            teams.append(dom.createMatchLabel(label, lang.getMatchStatus(results.status)));

        teams.append(team1, team2);
        match.append(teams);

        if (!connection)
            return match;

        dom.setupConnection(teams, match, connection);

        return match;
    }

    private createTeam(team: ParticipantResult | null, hint: MatchHint, inLowerBracket: boolean) {
        const teamContainer = dom.createTeamContainer();
        const nameContainer = dom.createNameContainer();
        const resultContainer = dom.createResultContainer();

        if (team === null)
            nameContainer.innerText = 'BYE';
        else
            this.renderParticipant(nameContainer, resultContainer, team, hint, inLowerBracket);

        teamContainer.append(nameContainer, resultContainer);

        if (team && team.id !== null)
            this.setupMouseHover(team.id, teamContainer);

        return teamContainer;
    }

    private renderParticipant(nameContainer: HTMLElement, resultContainer: HTMLElement, team: ParticipantResult, hint: MatchHint, inLowerBracket: boolean) {
        const participant = this.participants.find(item => item.id === team.id);

        if (participant) {
            nameContainer.innerText = participant.name;
            this.renderTeamOrigin(nameContainer, team, inLowerBracket);
        } else {
            this.renderHint(nameContainer, team, hint, inLowerBracket);
        }

        resultContainer.innerText = `${team.score || '-'}`;

        dom.setupWin(nameContainer, resultContainer, team);
        dom.setupLoss(nameContainer, resultContainer, team);
    }

    private renderHint(nameContainer: HTMLElement, team: ParticipantResult, hint: MatchHint, inLowerBracket: boolean) {
        if (hint === undefined || team.position === undefined) return;
        if (!this.config.showSlotsOrigin) return;
        if (!this.config.showLowerBracketSlotsOrigin && inLowerBracket) return;

        dom.setupHint(nameContainer, hint(team.position));
    }

    private renderTeamOrigin(name: HTMLElement, team: ParticipantResult, inLowerBracket: boolean) {
        if (team.position === undefined) return;
        if (this.config.participantOriginPlacement === 'none') return;
        if (!this.config.showSlotsOrigin) return;
        if (!this.config.showLowerBracketSlotsOrigin && inLowerBracket) return;

        // 'P' for position (where the participant comes from) and '#' for actual seeding.
        const origin = inLowerBracket ? `P${team.position}` : `#${team.position}`;

        dom.addTeamOrigin(name, origin, this.config.participantOriginPlacement);
    }

    private setupMouseHover(id: number, cell: HTMLElement) {
        if (!this.config.highlightParticipantOnHover) return;

        this.teamRefsDOM[id].push(cell);

        cell.addEventListener('mouseover', () => {
            this.teamRefsDOM[id].forEach(el => el.classList.add('hover'));
        });

        cell.addEventListener('mouseleave', () => {
            this.teamRefsDOM[id].forEach(el => el.classList.remove('hover'));
        });
    }
}

(window as any).bracketsViewer = new BracketsViewer();