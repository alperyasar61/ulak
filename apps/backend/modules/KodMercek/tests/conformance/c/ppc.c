/* Freestanding, source-owned static-analysis fixture. Never executed by KodMercek. */
volatile unsigned int rea_ppc_global = 7;
const char rea_ppc_marker[] = "KodMercek-ppc-source-owned-fixture";

__attribute__((noinline)) unsigned int rea_ppc_leaf(unsigned int value)
{
    return value * 3u + rea_ppc_global;
}

__attribute__((noinline)) unsigned int rea_ppc_entry(unsigned int selector)
{
    unsigned int adjusted = selector > 10u ? selector : selector + 1u;
    return rea_ppc_leaf(adjusted) + (unsigned char)rea_ppc_marker[0];
}

