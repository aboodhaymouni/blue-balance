"""Trace in-turn complaints up the pipe tree: which segment's failure best explains the zones that complain?

Each segment s (the reservoir, a main, or a zone's own feeder) is a hypothesis: zones downstream of s complain
with probability P_HIT, every other in-turn zone with P_BG. A "none" hypothesis (no fault, background noise
only) competes with them. Only zones in their supply turn are evidence: a zone outside its turn has no water
by schedule, so its silence or its complaints say nothing about the pipes.
"""
import math

from . import config


class Network:
    def __init__(self, data: dict):
        self.data = data
        self.nodes: dict[str, dict] = {n["id"]: n for n in data["nodes"]}
        self.children: dict[str, list[str]] = {}
        for n in data["nodes"]:
            if n.get("parent"):
                self.children.setdefault(n["parent"], []).append(n["id"])
        self.zones = [n["id"] for n in data["nodes"] if n["type"] == "zone"]

    def downstream_zones(self, segment: str) -> list[str]:
        if self.nodes[segment]["type"] == "zone":
            return [segment]
        out: list[str] = []
        for child in self.children.get(segment, []):
            out += self.downstream_zones(child)
        return out

    def name(self, node_id: str) -> str:
        return self.nodes[node_id]["name_ar"]


def analyse(network: Network, anomalies: dict[str, int], in_turn: dict[str, bool]) -> tuple[list[tuple[str, float]], dict[str, bool]]:
    """Return (hypotheses sorted by posterior, hit flag per zone). Hypothesis "none" means no fault."""
    live = [z for z in network.zones if in_turn.get(z)]
    hit = {z: anomalies.get(z, 0) >= config.MIN_ZONE_ANOMALIES for z in network.zones}

    def loglik(affected: set[str]) -> float:
        total = 0.0
        for z in live:
            p = config.P_HIT if z in affected else config.P_BG
            total += math.log(p if hit[z] else 1 - p)
        return total

    segments = [s for s in network.nodes if set(network.downstream_zones(s)) & set(live)]
    prior_segment = (1 - config.PRIOR_NONE) / max(len(segments), 1)
    scored = [("none", math.log(config.PRIOR_NONE) + loglik(set()))]
    scored += [(s, math.log(prior_segment) + loglik(set(network.downstream_zones(s)))) for s in segments]

    top = max(score for _, score in scored)
    weights = [(s, math.exp(score - top)) for s, score in scored]
    total = sum(w for _, w in weights)
    posteriors = sorted(((s, w / total) for s, w in weights), key=lambda x: -x[1])
    return posteriors, hit
