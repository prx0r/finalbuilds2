# Hypothesis evolution policy v1

## Objective
Hypotheses are research programs that earn influence by making useful out-of-sample predictions.
They are not assigned a single "probability of truth".

## Fitness components
A hypothesis is evaluated on:
- prequential predictive score versus a baseline;
- calibration of issued probabilities;
- posterior evidence for its declared effect directions;
- independence/diversity of resolved entities;
- information gain produced by experiments it motivated;
- optional complexity penalty.

## State machine
draft -> probation -> active -> promoted
                    \-> demoted -> retired
active/promoted -> branch (child hypothesis inherits provenance, not fitness)

## Minimum evidence gates
No promotion/demotion before:
- >= 8 resolved forecasts;
- >= 3 independent products/entities;
- >= 2 distinct time windows;
- no known resolver-integrity failure.

These are engineering guardrails, not universal statistical constants; change them only by
versioning the fitness policy.

## Promotion
Promote only when all hold:
- positive out-of-sample skill versus a declared baseline;
- posterior probability of the expected parameter direction >= 0.90 for at least one
  primary target parameter;
- no material calibration failure;
- predictive lift appears in more than one independent entity.

## Demotion
Demote when either:
- enough evidence exists and prequential skill is persistently worse than baseline; or
- the main parameter's posterior mass strongly contradicts the expected direction.

## Branch
Branch when:
- predictive performance is heterogeneous by context/category;
- a failure reveals a narrower mechanism;
- new research suggests a more precise falsifiable child.

Never mutate the old hypothesis into the new one. Create the child and preserve lineage.

## Allocation
Do not allocate builds by Beta-Bernoulli Thompson sampling over hypotheses.
Rank candidate experiments by:
    expected_product_utility
  + lambda_info * expected_information_gain
  + lambda_diversity * coverage_gain
  - build_cost
  - risk_penalty

Initially approximate information gain with uncertainty x discrimination score.
Only introduce full Bayesian optimal experimental design after the measurement layer is proven.
