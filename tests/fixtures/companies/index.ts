/**
 * Test Company Fixtures Index
 * 
 * Exports all test company data for use in tests
 */

import novoNordisk from './novo-nordisk/input.json' assert { type: 'json' };
import pleoTechnologies from './pleo-technologies/input.json' assert { type: 'json' };
import spisehusetFiveC from './spisehuset-5c/input.json' assert { type: 'json' };
import hydremaProduktion from './hydrema-produktion/input.json' assert { type: 'json' };
import murermesterK from './murermester-k/input.json' assert { type: 'json' };

export const testCompanies = {
    novoNordisk,
    pleoTechnologies,
    spisehusetFiveC,
    hydremaProduktion,
    murermesterK,
};

// By expected grade
export const healthyCompanies = [novoNordisk];
export const moderateCompanies = [hydremaProduktion, spisehusetFiveC, pleoTechnologies];
export const stressTestCompanies = [murermesterK];

// By company type
export const saasCompanies = [pleoTechnologies];
export const manufacturingCompanies = [novoNordisk, hydremaProduktion];
export const serviceCompanies = [spisehusetFiveC, murermesterK];

export default testCompanies;
