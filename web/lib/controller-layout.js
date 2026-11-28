// Local dimensions are metres. The housing back is at z=0, and the door faces +z.
const inch = .0254;
function enclosure(width, height, depth, outputs, drop, style, finish, channelsPerLead = 1) {
 return {width:width*inch, height:height*inch, depth:depth*inch, outputs, drop:drop*inch, style, finish, channelsPerLead};
}

// Factory assemblies and exterior dimensions from store.lightorama.com/products/
// ctb16pcg3, pixie{4,8,16}-controller-assembled-12v, pixie2-12v-complete,
// aurora-core-16-port-controller-assembled-12-volt-system and 10w-rgb-flood-complete-package.
// Bare controller boards have no fixed outdoor case. Use representative weatherproof builds.
export const cabinets = {
 ac16:enclosure(9.5,12,3.5,16,12,"ac","#827d76"),
 pixie2:enclosure(4.875,6.5,1.875,2,5,"mini","#20574a"),
 pixie4:enclosure(8.5,11.85,4.25,4,16,"wave","#a5a697"),
 pixie8:enclosure(11.75,13.75,5.5,8,17,"wave","#a5a697"),
 pixie16:enclosure(12.5,15.25,6,16,11,"panel","#b6b9ac"),
 aurora:enclosure(12+1/3,16,6,16,11,"panel","#b6b9ac"),
 cmb:enclosure(11.5,13.5,5,8,11,"wave","#a5a697",3),
 ac8:enclosure(9.5,12,3.5,8,12,"ac","#827d76"),
 cmb16:enclosure(11.5,13.5,5,16,10,"panel","#a5a697"),
 pixcon:enclosure(12.5,15.25,6,16,11,"panel","#b6b9ac"),
 edge:enclosure(6,8,3.5,4,7,"panel","#a5a697"),
};

export function cabinetBottom(spec, wall) {
 if (wall) return -spec.height/2;
 return spec.style==="mini" ? .07 : spec.drop+.06;
}

// Wire centers and mating faces are shared by the renderer and the route editor.
export function cabinetLead(spec, index, wall) {
 const {width:w, depth:d, height:h, outputs, drop, style} = spec;
 const bottom = cabinetBottom(spec,wall);
 const mini = style==="mini", ac = style==="ac";
 const bankSize = Math.min(8,outputs);
 const bank = Math.floor(index/bankSize), slot = index%bankSize;
 const u = (slot+.5)/bankSize, lane=(index+.5)/outputs;
 const direction = mini ? 1 : -1;
 const y = bottom+(mini?h:0);
 const startX = mini ? (lane-.5)*w*.6 : ac ? w*(.10+lane*.22) : w*((bank+.5)/Math.ceil(outputs/bankSize)-.5)*.91+(u-.5)*w*.23;
 const x = mini ? (lane-.5)*w*1.65 : ac ? (.07+(lane-.5)*1.34)*w : (lane-.5)*w*1.7;
 const z = d*(.47+bank*.18);
 const length = drop*(.68+.30*((slot*3+bank)%bankSize)/Math.max(1,bankSize-1));
 const end = [x,y+direction*length,z+.008+(slot%3)*.010];
 return {start:[startX,y,z], bend:[startX+(x-startX)*.25,y+direction*length*.53,z+.008], end};
}

export function cabinetSocket(spec, channel, wall) {
 const lead=Math.min(spec.outputs-1,Math.max(0,Math.floor((channel-1)/spec.channelsPerLead)));
 return cabinetLead(spec,lead,wall).end;
}

export function cabinetInlet(spec,wall) {
 return [-spec.width*.32,cabinetBottom(spec,wall),spec.depth*.38];
}

// Local connection and mounting positions on the standalone housings (metres).
export const standalone = {
 bridge:{depth:.10, inlet:[-.045,.020,.05]},
 tx:{depth:.045, inlet:[-.014,.022,.024]},
 rx:{depth:.045, inlet:[-.014,.022,.024]},
 cf50:{depth:.137, inlet:[-.08,.065,-.050]}
};
