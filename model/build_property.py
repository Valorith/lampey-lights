"""Build the Lampey Lights property in Blender. Run with --background --threads 1."""

import math
import struct
import sys
import zipfile
from pathlib import Path

import bpy
from mathutils import Vector


OUT = Path(__file__).resolve().parent
FOOT = .3048
PORCH_WIDTH_M, PORCH_DEPTH_M = 34*FOOT, 6*FOOT
DECK_HALF_WIDTH = 5.58  # Width in the coordinates fitted to the photographs.
SCALE = PORCH_WIDTH_M / (2*DECK_HALF_WIDTH)
HALF_WIDTH, DEPTH, EAVE, RIDGE = 5.60, 8.60, 5.47, 8.86
PORCH_FRONT = -PORCH_DEPTH_M / SCALE
FRONT_POST_Y = PORCH_FRONT + .27
GARAGE_GRADE = -3.04

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
bpy.context.preferences.filepaths.save_version = 0


def collection(name):
    coll = bpy.data.collections.new(name)
    scene.collection.children.link(coll)
    return coll


architecture = collection("House")
grounds = collection("Grounds")
guides = collection("Mounting paths")
references = collection("Alignment reference · toggle in Outliner")
studio = collection("Preview cameras and sun")
root = bpy.data.objects.new("Lampey property", None)
architecture.objects.link(root)
root.empty_display_size = 0.15
root["scale_status"] = "reported_porch_footprint"
root["scale_source"] = "User-provided screenshot reporting assessor sketch dimensions; field verification pending."
root["porch_footprint_width_m"] = PORCH_WIDTH_M
root["porch_footprint_depth_m"] = PORCH_DEPTH_M
root["property_revision"] = "rear-room-slider-4"


def material(name, color):
    rgb = tuple(int(color[i:i + 2], 16) / 255 for i in (0, 2, 4))
    linear = tuple(((v + .055) / 1.055) ** 2.4 if v > .04045 else v / 12.92 for v in rgb)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Roughness"].default_value = .84
    return mat


wall = material("Cool white clapboard", "d6dce0")
lap = material("Siding lap shadow", "bdc6cc")
trim = material("Painted white trim", "f3f0e8")
roof = material("Graphite shingles", "474b53")
roof_edge = material("Roof edge and gutter", "686e72")
glass = material("Blue grey glazing", "536771")
shutter = material("Charcoal shutters", "29343c")
door = material("Front door", "454d4c")
deck = material("Weathered decking", "9e9588")
base = material("Foundation", "a9a8a1")
stone = material("Retaining blocks", "716e65")
lattice = material("Shade behind lattice", "8e9290")
lawn = material("Lawn", "78835a")
asphalt = material("Driveway", "515356")
path_mat = material("Walkway", "666769")
needles = material("Evergreen", "425743")
leaf = material("Shrub", "606b4e")
water = material("Pool water", "248bc7")
water_shader = water.node_tree.nodes["Principled BSDF"]
water_shader.inputs["Roughness"].default_value = .20
water_shader.inputs["Alpha"].default_value = .58
pool_boards = material("Painted pool surround", "e4e4df")
liner = material("Blue pool liner", "206da0")
liner_band = material("Waterline band", "193c71")
stair_boards = material("Charcoal stair treads", "5b6062")
pickets = material("Black railing balusters", "252a2e")
cap_glass = material("Post lantern glazing", "b1c1c4")
cover_blue = material("Rolled solar cover", "1978af")
wicker = material("Outdoor wicker", "6b6157")
cushion = material("Patio cushions", "b1afa5")


class Part:
    """Batch fixed geometry by editable building element and material."""

    def __init__(self, name, group=architecture):
        self.name, self.group = name, group
        self.vertices, self.faces, self.face_materials, self.materials = [], [], [], []

    def poly(self, verts, faces, mat):
        if mat not in self.materials:
            self.materials.append(mat)
        idx = self.materials.index(mat)
        offset = len(self.vertices)
        self.vertices.extend(tuple(v) for v in verts)
        for face in faces:
            self.faces.append(tuple(offset + j for j in face))
            self.face_materials.append(idx)

    def box(self, x0, x1, y0, y1, z0, z1, mat):
        assert min(x1 - x0, y1 - y0, z1 - z0) > 0, self.name
        self.solid([(x0,y0,z0), (x1,y0,z0), (x1,y1,z0), (x0,y1,z0)],
                   [(x0,y0,z1), (x1,y0,z1), (x1,y1,z1), (x0,y1,z1)], mat)

    def solid(self, bottom, top, mat):
        n = len(bottom)
        faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
        for i in range(n):
            j = (i + 1) % n
            faces.append((i, j, j+n, i+n))
        self.poly([*bottom, *top], faces, mat)

    def beam(self, a, b, width, depth, mat):
        a, b = Vector(a), Vector(b)
        direction = (b-a).normalized()
        axis = Vector((0,0,1)) if abs(direction.z) < .94 else Vector((0,1,0))
        u = direction.cross(axis).normalized() * (width/2)
        v = direction.cross(u).normalized() * (depth/2)
        cross = [-u-v, u-v, u+v, -u+v]
        self.solid([a+p for p in cross], [b+p for p in cross], mat)

    def finish(self):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata([tuple(a*SCALE for a in pt) for pt in self.vertices], [], self.faces)
        for mat in self.materials:
            mesh.materials.append(mat)
        for face, idx in zip(mesh.polygons, self.face_materials):
            face.material_index = idx
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        self.group.objects.link(obj)
        obj.parent = root
        return obj


def mount(key, points):
    # An empty node survives glTF export without adding visible construction lines.
    obj = bpy.data.objects.new("mount." + key, None)
    guides.objects.link(obj)
    obj.parent = root
    obj.location = Vector(points[0]) * SCALE
    obj.empty_display_size = .055*SCALE
    obj["mount_id"] = key
    local = [(Vector(v)-Vector(points[0]))*SCALE for v in points]
    obj["path_local_gltf_xyz"] = [n for x,y,z in local for n in (x,z,-y)]


def slab(part, corners, thickness, mat):
    part.solid([(x,y,z-thickness) for x,y,z in corners], corners, mat)


def build_shell():
    shell = Part("Main walls and foundation")
    shell.box(-HALF_WIDTH, HALF_WIDTH, 0, DEPTH, GARAGE_GRADE-.14, -.14, base)
    shell.box(HALF_WIDTH,HALF_WIDTH+.001,0,DEPTH,GARAGE_GRADE+.08,-.14,wall)
    shell.box(-HALF_WIDTH, HALF_WIDTH, 0, DEPTH, -.14, EAVE, wall)
    # A triangular prism with its gables on the two side elevations.
    shell.solid([(-HALF_WIDTH,0,EAVE), (-HALF_WIDTH,DEPTH,EAVE), (-HALF_WIDTH,DEPTH/2,RIDGE)],
                [(HALF_WIDTH,0,EAVE), (HALF_WIDTH,DEPTH,EAVE), (HALF_WIDTH,DEPTH/2,RIDGE)], wall)
    for x in (-HALF_WIDTH, HALF_WIDTH-.12):
        for y in (-.028, DEPTH-.10):
            shell.box(x-.015,x+.135,y,y+.13,-.13,EAVE,trim)
    shell.finish()
    siding = Part("Clapboard courses")
    for i in range(1,71):
        z = GARAGE_GRADE + i*.167
        if z >= RIDGE: break
        if -.10 < z < EAVE-.08:
            for y in (-.012, DEPTH+.002):
                siding.box(-HALF_WIDTH+.13,HALF_WIDTH-.13,y,y+.010,z,z+.013,lap)
        start = max(.05, DEPTH/2*(z-EAVE)/(RIDGE-EAVE)+.04)
        if start >= DEPTH/2-.04: continue
        for x in (-HALF_WIDTH-.012,HALF_WIDTH+.002):
            siding.box(x,x+.010,start,DEPTH-start,z,z+.013,lap)
    siding.finish()
    top = Part("Main roof and fascia")
    a,b = -5.81,5.81
    fore,mid,back = -.23,DEPTH/2,DEPTH+.23
    e = EAVE-.16
    slab(top,[(a,fore,e),(b,fore,e),(b,mid,RIDGE+.07),(a,mid,RIDGE+.07)],.10,roof)
    slab(top,[(a,mid,RIDGE+.07),(b,mid,RIDGE+.07),(b,back,e),(a,back,e)],.10,roof)
    for y in (fore,back):
        top.box(a,b,y-.05,y+.05,e-.19,e+.015,trim)
    for x in (a,b):
        top.beam((x,fore,e-.06),(x,mid,RIDGE),.13,.13,trim)
        top.beam((x,mid,RIDGE),(x,back,e-.06),.13,.13,trim)
    top.finish()
    mount("front.upper-eave",[(a,fore-.052,e-.08),(b,fore-.052,e-.08)])
    chimney = Part("Chimney on lawn side")
    chimney.box(-6.03,-5.45,3.27,4.25,-1.6,8.62,wall)
    chimney.box(-6.10,-5.39,3.19,4.32,8.60,8.79,base)
    chimney.finish()


def facade_box(part, side, plane, u0,u1, z0,z1, out0,out1, mat):
    if side == "front": part.box(u0,u1,plane-out1,plane-out0,z0,z1,mat)
    elif side == "rear": part.box(u0,u1,plane+out0,plane+out1,z0,z1,mat)
    elif side == "right": part.box(plane+out0,plane+out1,u0,u1,z0,z1,mat)
    else: part.box(plane-out1,plane-out0,u0,u1,z0,z1,mat)


def window(name, side, plane, center, bottom, width, height, shutters=False):
    part=Part(name)
    left,right,top=center-width/2,center+width/2,bottom+height
    def rect(l,r,b,t,o0,o1,mat):
        facade_box(part,side,plane,l,r,b,t,o0,o1,mat)
    rect(left-.07,right+.07,bottom-.065,top+.07,.018,.079,trim)
    rect(left,right,bottom,top,.078,.087,glass)
    rect(center-.014,center+.014,bottom,top,.089,.103,trim)
    for frac in (.25,.5,.75):
        th=.024 if frac==.5 else .012
        z=bottom+height*frac
        rect(left,right,z-th,z+th,.088,.105,trim)
    rect(left-.09,right+.09,bottom-.08,bottom-.035,.04,.15,trim)
    if shutters:
        for l,r in [(left-.41,left-.09),(right+.09,right+.41)]:
            rect(l,r,bottom-.025,top+.02,.021,.063,shutter)
            for frac in (.08,.48,.90):
                z=bottom+height*frac
                rect(l+.025,r-.025,z,z+.025,.064,.074,roof)
    part.finish()


def dormer(key, center):
    part = Part("Dormer " + key)
    half,front,peak,shoulder = 1.13,.66,8.53,7.61
    slope = (RIDGE+.07-(EAVE-.16))/(DEPTH/2+.23)
    def main_height(y): return EAVE-.16+(y+.23)*slope
    # Intersect the cheek walls and both dormer roof planes with the main roof.
    y_eave=(shoulder-(EAVE-.16))/slope-.23
    y_peak=(peak-(EAVE-.16))/slope-.23
    l,r=center-half,center+half
    def facade(y): return [(l,y,main_height(y)-.05),(r,y,main_height(y)-.05),(r,y,shoulder),(center,y,peak),(l,y,shoulder)]
    part.poly(facade(front),[(0,1,2,3,4)],wall)
    for x in (l,r):
        vs=[(x,front,main_height(front)-.05),(x,y_eave,shoulder),(x,front,shoulder)]
        part.poly(vs,[(0,1,2) if x==r else (2,1,0)],wall)
    for x1,x2,z1,z2,y1,y2 in [(l-.10,center,shoulder,peak,y_eave,y_peak),(center,r+.10,peak,shoulder,y_peak,y_eave)]:
        slab(part,[(x1,front-.13,z1+.06),(x2,front-.13,z2+.06),(x2,y2+.10,z2+.06),(x1,y1+.10,z1+.06)],.08,roof)
        part.beam((x1,front-.14,z1),(x2,front-.14,z2),.115,.10,trim)
    part.finish()
    window("Dormer sash "+key,"front",front,center,6.11,.85,1.31)
    mount("dormer."+key,[(l-.10,front-.20,shoulder),(center,front-.20,peak),(r+.10,front-.20,shoulder)])


def railing(part, a, b, bottom, height=.92):
    x,y=a; dx,dy=b[0]-x,b[1]-y; length=math.hypot(dx,dy)
    for h,w in ((.14,.075),(height,.092)):
        part.beam((x,y,bottom+h),(*b,bottom+h),w,.067,trim)
    count=math.ceil(length/.19)
    for i in range(1,count):
        px,py=x+dx*i/count,y+dy*i/count
        part.box(px-.021,px+.021,py-.021,py+.021,bottom+.13,bottom+height-.025,trim)


def build_porch():
    p=Part("Front porch deck and skirt")
    p.box(-DECK_HALF_WIDTH,DECK_HALF_WIDTH,PORCH_FRONT,0,-.17,0,deck)
    p.box(-5.50,5.50,PORCH_FRONT+.09,PORCH_FRONT+.15,-1.29,-.17,lattice)
    for a,b in [(-5.46,-1.03),(1.37,5.46)]:
        for sign in (-1,1):
            start=a-1.1
            while start<b:
                l=max(a,start); r=min(b,start+1.10)
                if r>l+.008:
                    def z(x): return -1.27+(x-start if sign==1 else 1.10-x+start)
                    p.beam((l,PORCH_FRONT+.073,z(l)),(r,PORCH_FRONT+.073,z(r)),.031,.028,trim)
                start+=.235
    p.finish()
    p=Part("Front porch canopy and gutter")
    slab(p,[(-5.66,PORCH_FRONT-.08,2.56),(5.66,PORCH_FRONT-.08,2.56),(5.66,.05,2.99),(-5.66,.05,2.99)],.12,roof)
    p.box(-5.69,5.69,PORCH_FRONT-.125,PORCH_FRONT-.025,2.36,2.55,trim)
    p.box(-5.72,5.72,PORCH_FRONT-.17,PORCH_FRONT-.08,2.51,2.58,roof_edge)
    p.finish()
    mount("porch.fascia",[(-5.69,PORCH_FRONT-.13,2.44),(5.69,PORCH_FRONT-.13,2.44)])
    p=Part("Front porch posts and railings")
    xs=[-5.27,-3.18,-.96,1.33,3.28,5.27]
    for x in xs:
        p.box(x-.08,x+.08,FRONT_POST_Y-.08,FRONT_POST_Y+.08,0,2.48,trim)
        p.box(x-.105,x+.105,FRONT_POST_Y-.105,FRONT_POST_Y+.105,0,.15,trim)
    for i,(a,b) in enumerate(zip(xs,xs[1:])):
        if i!=2: railing(p,(a,FRONT_POST_Y),(b,FRONT_POST_Y),0)
    for x in (xs[0],xs[-1]): railing(p,(x,FRONT_POST_Y),(x,-.04),0)
    p.finish()
    for key,a,b in [('left',xs[0],xs[2]),('right',xs[3],xs[5])]:
        mount('porch.rail.'+key,[(a,FRONT_POST_Y,.955),(b,FRONT_POST_Y,.955)])
    stairs=Part("Front entrance steps")
    for i in range(7):
        y=PORCH_FRONT-(i+1)*.255
        z=-(i+1)*.175
        stairs.box(-.94,1.31,y,y+.26,-1.30,z,trim)
        stairs.box(-.965,1.335,y-.022,y+.252,z,z+.032,deck)
    for x in (-1.01,1.38):
        stairs.beam((x,FRONT_POST_Y-.10,.91),(x,PORCH_FRONT-1.65,-.29),.079,.074,trim)
        stairs.box(x-.055,x+.055,PORCH_FRONT-1.68,PORCH_FRONT-1.57,-1.27,-.29,trim)
    stairs.finish()


def build_openings():
    for i,x in enumerate([-4.29,-2.13,.10,2.47,4.57]):
        window("Upper front window "+str(i+1),"front",0,x,3.26,.79,1.65,True)
    for i,x in enumerate([-4.25,-2.12,2.52,4.55]):
        window("Porch window "+str(i+1),"front",0,x,.82,.79,1.37,True)
    p=Part("Front entrance")
    p.box(.06,1.13,-.08,-.02,.01,2.10,trim)
    p.box(.14,1.05,-.10,-.08,.02,2.02,door)
    p.box(.27,.92,-.112,-.102,.99,1.84,glass)
    p.finish()
    for idx,y in enumerate((2.19,6.42),1):
        p=Part("Driveway garage door "+str(idx))
        w=3.16
        p.box(5.602,5.68,y-w/2-.10,y+w/2+.10,GARAGE_GRADE,GARAGE_GRADE+2.22,trim)
        p.box(5.681,5.696,y-w/2,y+w/2,GARAGE_GRADE+.02,GARAGE_GRADE+2.13,wall)
        for j in range(1,5):
            z=GARAGE_GRADE+2.13*j/5
            p.box(5.697,5.709,y-w/2,y+w/2,z,z+.015,lap)
        for j in range(4):
            a=y-w/2+.18+j*.74
            p.box(5.698,5.71,a,a+.57,GARAGE_GRADE+1.75,GARAGE_GRADE+1.98,glass)
        p.finish()
        mount('garage.'+str(idx),[(5.716,y-w/2,GARAGE_GRADE+.04),(5.716,y-w/2,GARAGE_GRADE+2.19),(5.716,y+w/2,GARAGE_GRADE+2.19),(5.716,y+w/2,GARAGE_GRADE+.04)])
    entry=Part("Garage pedestrian entry")
    facade_box(entry,"right",HALF_WIDTH,3.79,4.85,GARAGE_GRADE+.01,GARAGE_GRADE+2.17,.013,.09,trim)
    facade_box(entry,"right",HALF_WIDTH,3.87,4.77,GARAGE_GRADE+.025,GARAGE_GRADE+2.08,.09,.115,wall)
    entry.finish()
    for side,plane,openings in [
        ('right',HALF_WIDTH,[(1.93,.75,.80,1.19),(5.42,3.25,.72,1.36),(7.26,3.25,.72,1.36),(4.30,6.75,.50,.75)]),
        ('left',-HALF_WIDTH,[(6.29,3.12,.78,1.44),(5.76,6.69,.55,.79)]),
        ('rear',DEPTH,[(-3.55,3.40,.69,.85),(-1.09,3.40,.67,.85),(-4.04,.82,.67,1.05),(3.64,.86,.90,1.32)])]:
        for i,(u,z,w,h) in enumerate(openings):
            window(side.title()+" window "+str(i+1),side,plane,u,z,w,h)


def round_bar(part, start, end, radius, mat, sides=12):
    a, b = Vector(start), Vector(end)
    axis = (b-a).normalized()
    guide = Vector((0,0,1)) if abs(axis.z) < .9 else Vector((0,1,0))
    u = axis.cross(guide).normalized() * radius
    v = axis.cross(u)
    ring = [u*math.cos(i*math.tau/sides) + v*math.sin(i*math.tau/sides) for i in range(sides)]
    part.solid([a+d for d in ring], [b+d for d in ring], mat)


def capped_post(part, x, y, floor, height=1.03):
    cap = floor + height
    part.box(x-.067,x+.067,y-.067,y+.067,floor-.05,cap,trim)
    part.box(x-.082,x+.082,y-.082,y+.082,floor,floor+.056,trim)
    part.box(x-.084,x+.084,y-.084,y+.084,cap,cap+.033,trim)
    part.box(x-.058,x+.058,y-.058,y+.058,cap+.033,cap+.105,cap_glass)
    part.box(x-.084,x+.084,y-.084,y+.084,cap+.105,cap+.135,trim)


def stair_guard(part, a, b):
    # a and b are the floor elevations at the first and last post.
    for h,w in ((.15,.070),(.94,.086)):
        part.beam((a[0],a[1],a[2]+h),(b[0],b[1],b[2]+h),w,.069,trim)
    count = math.ceil(math.dist(a[:2],b[:2])/.14)
    for i in range(1,count):
        x,y,z = (p+(q-p)*i/count for p,q in zip(a,b))
        part.box(x-.012,x+.012,y-.012,y+.012,z+.15,z+.94,pickets)


def rear_flight(key, origin, direction, width, top, bottom, risers, flared=False):
    part = Part("Back stairs · "+key)
    dx,dy = direction
    tread = .30
    run = (risers-1)*tread
    rise = (top-bottom)/risers

    def world(u,v,z):
        return (origin[0]+u*dx-v*dy, origin[1]+u*dy+v*dx, z)

    def step_slab(plan,z,thickness,mat):
        slab(part,[world(u,v,z) for u,v in plan],thickness,mat)

    for i in range(risers-1):
        u=i*tread
        z=top-(i+1)*rise
        last = flared and i==risers-2
        nose = [(u,0),(u+tread*.5,-.10),(u+tread,-.03),(u+tread,width+.03),
                (u+tread*.5,width+.10),(u,width)] if last else [
                    (u,0),(u+tread,0),(u+tread,width),(u,width)]
        step_slab(nose,z-.037,rise,trim)
        step_slab([(a+.012,b) for a,b in nose],z,.038,stair_boards)
    for name,v in [('a',.052),('b',width-.052)]:
        outer = -.025 if name=='a' else width+.025
        slab(part,[world(0,outer-.028,top-.095),world(run,outer-.028,bottom+rise-.095),
                   world(run,outer+.028,bottom+rise-.095),world(0,outer+.028,top-.095)],.25,trim)
        a,b=world(0,v,top),world(run,v,bottom+rise)
        stair_guard(part,a,b)
        capped_post(part,*a)
        capped_post(part,*b)
        mount("stairs."+key+"."+name,[(*a[:2],a[2]+.985),(*b[:2],b[2]+.985)])
    part.finish()


def pool_equipment(left,right,near,far,rim):
    entry=Part("Pool entry steps and handrails")
    # Nested corner treads descend toward the basin center.
    for radius,level in [(1.13,-.63),(.90,-.46),(.65,-.29),(.40,-.11)]:
        outline=[(right,far,rim+level)]
        for i in range(15):
            angle=math.pi+i*math.pi/28
            outline.append((right+radius*math.cos(angle),far+radius*math.sin(angle),rim+level))
        slab(entry,outline,.19,trim)
    for x,y in [(right-.12,far-.76),(right-.80,far-.10)]:
        rail=[(x+.12,y+.12,rim+.01),(x+.12,y+.12,rim+.65),(x+.03,y+.03,rim+.70),
              (x-.31,y-.31,rim+.43),(x-.31,y-.31,rim-.34)]
        for a,b in zip(rail,rail[1:]):
            round_bar(entry,a,b,.021,trim)
    entry.finish()
    reel=Part("Pool cover reel")
    x=left-.34
    for y in (near+.10,far-.10):
        reel.box(x-.19,x+.19,y-.075,y+.075,rim,rim+.055,pickets)
        round_bar(reel,(x-.16,y,rim+.05),(x,y,rim+.31),.025,pickets)
        round_bar(reel,(x+.16,y,rim+.05),(x,y,rim+.31),.025,pickets)
    round_bar(reel,(x,near+.04,rim+.31),(x,far-.04,rim+.31),.041,trim)
    round_bar(reel,(x,near+.24,rim+.31),(x,far-.24,rim+.31),.14,cover_blue,20)
    reel.finish()


def pool_seating(rim):
    seating=Part("Poolside sectional and chairs")
    def seat(x,y,angle):
        start=len(seating.vertices)
        seating.box(-.45,.45,-.45,.45,0,.33,wicker)
        seating.box(-.44,.44,-.28,.44,.33,.47,cushion)
        seating.box(-.44,.44,-.43,-.27,.33,.76,cushion)
        cosine,sine=math.cos(angle),math.sin(angle)
        for i in range(start,len(seating.vertices)):
            a,b,z=seating.vertices[i]
            seating.vertices[i]=(x+a*cosine-b*sine,y+a*sine+b*cosine,rim+z)
    for i in range(4):
        seat(1.45+.91*i,12.34,0)
    for i in range(2):
        seat(5.88,14.72+.91*i,math.pi/2)
    for x in (4.72,5.69):
        seat(x,18.32,math.pi)
    seating.box(2.7,3.39,13.22,13.83,rim,rim+.34,wicker)
    for x in (-3.96,-2.96):
        seating.box(x,x+.64,12.08,13.69,rim+.23,rim+.31,stair_boards)
        slab(seating,[(x,12.07,rim+.73),(x+.64,12.07,rim+.73),
                      (x+.64,12.59,rim+.32),(x,12.59,rim+.32)],.06,stair_boards)
        for y in (12.23,13.48):
            seating.box(x+.06,x+.58,y,y+.065,rim,rim+.24,pickets)
    obj=seating.finish()
    obj["role"]="movable_furniture"
    obj["placement_surface"]=False


def rear_slider(room, x, wall_y, face_y, wall_top):
    # In IMG_5259 the glass meeting rail is near the middle of this wall.
    # The separate window visible in IMG_5678 belongs to the main house.
    center = (DEPTH + face_y) / 2
    jamb_a, jamb_b = center - 1.00, center + 1.00
    sill, head = -.08, 2.12

    def siding(y0, y1, z0, z1):
        room.poly([(x,y0,z0),(x,y1,z0),(x,y1,z1),(x,y0,z1)],[(0,1,2,3)],wall)

    siding(wall_y,jamb_a,-.25,wall_top)
    siding(jamb_b,face_y,-.25,wall_top)
    siding(jamb_a,jamb_b,-.25,sill)
    siding(jamb_a,jamb_b,head,wall_top)

    slider = Part("Back room sliding glass door")
    def bar(y0,y1,z0,z1,inner,outer,mat):
        facade_box(slider,"right",x,y0,y1,z0,z1,inner,outer,mat)

    casing = .063
    bar(jamb_a,jamb_b,sill,sill+.035,-.105,.048,roof_edge)
    bar(jamb_a,jamb_b,head-casing,head,-.105,.035,trim)
    for a,b in [(jamb_a,jamb_a+casing),(jamb_b-casing,jamb_b)]:
        bar(a,b,sill+.035,head-casing,-.105,.035,trim)

    pane = material("Patio door glazing","455d68")
    pane.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value=.22
    # Both full-height sashes fit inside the casing on staggered tracks.
    bottom,top = sill+.035,head-casing
    stile=.040
    for a,b,track in [(jamb_a+casing,center+.020,-.072),
                      (center-.020,jamb_b-casing,-.030)]:
        for u,v in [(a,a+stile),(b-stile,b)]:
            bar(u,v,bottom,top,track,track+.028,trim)
        bar(a+stile,b-stile,bottom,bottom+.065,track,track+.028,trim)
        bar(a+stile,b-stile,top-stile,top,track,track+.028,trim)
        bar(a+stile,b-stile,bottom+.065,top-stile,track+.006,track+.016,pane)
    # A short pull stands proud of the near sash at the meeting rail.
    for z in (.87,1.05):
        bar(center-.012,center+.010,z,z+.022,-.002,.055,shutter)
    bar(center-.014,center+.012,.87,1.072,.050,.071,shutter)
    slider.finish()


def rear_roof(room, left, right, face_y):
    # Pool elevation (IMG_4010) establishes the cross section. IMG_5259
    # shows the driveway eave running from the house to the outside post.
    ridge = (left + right) / 2
    profile = [(left-.20, 2.72), (ridge, 3.28), (right, 2.76), (5.75, 2.30)]
    wall_y, fascia_y = DEPTH-.045, face_y+.20
    thickness = .13
    def underside(x):
        for (a, za), (b, zb) in zip(profile, profile[1:]):
            if a <= x <= b:
                return za + (zb-za)*(x-a)/(b-a) - thickness
        raise ValueError("Outside rear roof")

    # The deck-facing side is built around the recessed slider opening.
    section = [(left,-.25),(left,underside(left)),(ridge,underside(ridge)),
               (right,underside(right)),(right,-.25)]
    corners=[(x,y,z) for y in (wall_y,face_y) for x,z in section]
    caps=[(4,3,2,1,0),(5,6,7,8,9)]
    sides=[(i,(i+1)%5,(i+1)%5+5,i+5) for i in (0,1,2,4)]
    room.poly(corners,caps+sides,wall)
    rear_slider(room,right,wall_y,face_y,underside(right))

    # One closed shell: adjoining slopes reuse the same indexed vertices.
    # Each station runs around the section from house to pool and back.
    canopy = Part("Continuous rear roof and fascia")
    for x,z in profile:
        canopy.vertices.extend([(x,wall_y,z),(x,fascia_y,z),
                                (x,fascia_y,z-thickness),(x,wall_y,z-thickness)])
    canopy.materials = [roof,trim]
    for i in range(len(profile)-1):
        a,b = 4*i,4*(i+1)
        for j in range(4):
            k=(j+1)%4
            canopy.faces.append((a+j,b+j,b+k,a+k))
            canopy.face_materials.append(0 if j==0 else 1)
    last = 4*(len(profile)-1)
    canopy.faces.extend([(0,1,2,3),(last+3,last+2,last+1,last)])
    canopy.face_materials.extend([1,1])
    canopy.finish()
    mount("rear.addition.fascia",[(x,fascia_y+.018,z-thickness/2) for x,z in reversed(profile)])
    return underside


def build_rear():
    # Looking from the backyard, the open porch is on the garage side.
    room=Part("Rear projecting windowed room")
    l,r,y=-3.13,1.00,11.64
    room.box(l+.04,r-.04,DEPTH,y-.04,-2.59,-.24,lattice)
    for x in (l+.09,r-.09):
        room.box(x-.05,x+.05,y-.09,y,-2.57,-.18,trim)
    soffit_height=rear_roof(room,l,r,y)
    room.finish()
    for i,x in enumerate((-.93,.12)): window("Rear room garden sash "+str(i+1),"rear",y,x,.72,.88,1.46)
    for i,u in enumerate((9.55,10.68)): window("Rear room side sash "+str(i+1),"left",l,u,.73,.92,1.42)
    porch=Part("Rear covered porch and upper landing")
    porch.box(r,5.59,DEPTH,11.69,-.27,-.08,deck)
    for x in (r+.14,5.44):
        porch.box(x-.085,x+.085,11.45,11.62,-2.57,-.27,base)
    beam_x=5.52
    post_top=soffit_height(beam_x)
    porch.box(beam_x-.095,beam_x+.095,DEPTH,11.65,post_top-.13,post_top+.015,trim)
    porch.box(beam_x-.075,beam_x+.075,11.48,11.63,-.08,post_top-.13,trim)
    stair_guard(porch,(r,11.58,-.08),(5.52,11.58,-.08))
    stair_guard(porch,(5.52,DEPTH,-.08),(5.52,10.05,-.08))
    capped_post(porch,3.27,11.58,-.08)
    porch.box(r,5.59,11.52,11.58,-2.50,-.27,lattice)
    # White lattice on the garden face of the windowed room and upper porch.
    z0,z1 = -2.50,-.28
    for sign in (-1,1):
        start=l-(z1-z0)
        while start<5.59:
            a=max(l,start); b=min(5.59,start+z1-z0)
            if b>a+.005:
                za=z0+(a-start if sign==1 else z1-z0-a+start)
                zb=z0+(b-start if sign==1 else z1-z0-b+start)
                porch.beam((a,11.649,za),(b,11.649,zb),.035,.032,trim)
            start+=.20
    porch.finish()

    # Corner proportions from IMG_5177, 5335 and 5337. Absolute scale is provisional.
    xmin,xmax,ymin,ymax = -5.23,6.86,11.75,19.04
    left,right,near,far = -4.53,3.47,14.36,18.36
    rim=-1.34
    landing=Part("Gray stair landing and return")
    landing.box(7.39,9.05,9.95,13.35,rim-.18,rim,stair_boards)
    landing.box(xmax,7.39,11.75,13.35,rim-.18,rim,stair_boards)
    for x,y in [(9.,9.96),(9.,13.30),(xmax+.06,13.30),(7.44,10.05)]:
        landing.box(x-.07,x+.07,y-.07,y+.07,grade(x,y)-.03,rim-.18,base)
    for a,b in [((9.,9.96,rim),(9.,13.30,rim)),((9.,13.30,rim),(xmax+.06,13.30,rim))]:
        stair_guard(landing,a,b)
        capped_post(landing,*b)
    landing.finish()
    rear_flight("upper",(5.59,10.05),(1,0),1.54,-.08,rim,7,flared=True)
    rear_flight("driveway",(7.39,9.95),(0,-1),1.66,rim,GARAGE_GRADE+.035,9)
    surround=Part("Pool surround and coping")
    # Four strips leave a genuine opening around the water surface.
    for a,b,c,d in [(xmin,xmax,ymin,near),(xmin,xmax,far,ymax),(xmin,left,near,far),(right,xmax,near,far)]:
        surround.box(a,b,c,d,rim-.15,rim,pool_boards)
    for a,b,c,d in [(left-.10,right+.10,near-.10,near),(left-.10,right+.10,far,far+.10),(left-.10,left,near,far),(right,right+.10,near,far)]:
        surround.box(a,b,c,d,rim-.012,rim+.024,trim)
    surround.finish()
    walls=Part("Pool liner and waterline band")
    floor=rim-1.13
    walls.box(left,right,near,far,floor-.04,floor,liner)
    for a,b,c,d in [(left-.045,left+.006,near,far),(right-.006,right+.045,near,far),
                    (left,right,near-.045,near+.006),(left,right,far-.006,far+.045)]:
        walls.box(a,b,c,d,floor,rim-.24,liner)
        walls.box(a,b,c,d,rim-.24,rim-.012,liner_band)
    walls.finish()
    basin=Part("Rectangular pool water")
    basin.poly([(left,near,rim-.15),(right,near,rim-.15),(right,far,rim-.15),(left,far,rim-.15)],[(0,1,2,3)],water)
    obj=basin.finish()
    obj["role"]="pool_water"
    obj["placement_surface"]=False
    obj["shape_source"]="owner_confirmed_rectangular"
    obj["dimensions_status"]="estimated"
    pool_equipment(left,right,near,far,rim)
    pool_seating(rim)
    fence=Part("Pool fence and lattice skirt")
    fence_posts=set()
    def pool_edge(a,b,skirt=True,rail=True):
        length=math.dist(a,b)
        spans=math.ceil(length/2.30)
        if rail:
            for i in range(spans+1):
                t=i/spans
                x=round(a[0]+(b[0]-a[0])*t,5); y=round(a[1]+(b[1]-a[1])*t,5)
                if (x,y) not in fence_posts:
                    fence.box(x-.044,x+.044,y-.044,y+.044,rim-.08,rim+1.06,trim)
                    fence_posts.add((x,y))
            for h in (.07,1.00):
                fence.beam((*a,rim+h),(*b,rim+h),.043,.044,trim)
            bars=math.ceil(length/.145)
            for i in range(1,bars):
                x=a[0]+(b[0]-a[0])*i/bars; y=a[1]+(b[1]-a[1])*i/bars
                fence.box(x-.013,x+.013,y-.013,y+.013,rim+.07,rim+1.00,trim)
        if skirt:
            dx=(b[0]-a[0])/length; dy=(b[1]-a[1])/length
            z0=min(-2.60,grade(*a)-.04,grade(*b)-.04)
            fence.beam((*a,(z0+rim-.12)/2),(*b,(z0+rim-.12)/2),.055,rim-.12-z0,lattice)
            for z in (z0+.045,rim-.13): fence.beam((*a,z),(*b,z),.092,.085,trim)
            for sign in (-1,1):
                s=-(rim-.19-z0)
                while s<length:
                    u=max(0,s); v=min(length,s+rim-.19-z0)
                    if v>u+.01:
                        def pt(t):
                            z=z0+.035+(t-s if sign==1 else rim-.19-z0-t+s)
                            return (a[0]+dx*t+dy*.036,a[1]+dy*t-dx*.036,z)
                        fence.beam(pt(u),pt(v),.025,.025,trim)
                    s+=.23
    pool_edge((xmax,ymax),(xmin,ymax))
    pool_edge((xmin,ymax),(xmin,ymin))
    gate_start,gate_end=12.00,13.04
    pool_edge((xmax,gate_end),(xmax,ymax))
    pool_edge((xmax,ymin),(xmax,gate_start),False)
    pool_edge((xmin,ymin),(xmax,ymin),False)
    pool_edge((9.05,9.95),(9.05,13.35),rail=False)
    pool_edge((9.05,13.35),(xmax,13.35),rail=False)
    fence.finish()
    gate=Part("White pool entry gate")
    for y in (gate_start+.06,gate_end-.06):
        gate.box(xmax-.026,xmax+.026,y-.023,y+.023,rim+.06,rim+1.0,trim)
    for z in (rim+.09,rim+.99):
        gate.box(xmax-.026,xmax+.026,gate_start+.04,gate_end-.04,z-.022,z+.022,trim)
    for i in range(1,7):
        y=gate_start+.06+(gate_end-gate_start-.12)*i/7
        gate.box(xmax-.013,xmax+.013,y-.013,y+.013,rim+.09,rim+.99,trim)
    gate.box(xmax+.025,xmax+.06,gate_end-.13,gate_end-.03,rim+.81,rim+.875,pickets)
    gate.finish()
    mount('pool.fence.back',[(xmin,ymax,rim+1.035),(xmax,ymax,rim+1.035)])
    mount('pool.fence.driveway-side',[(xmax,gate_end,rim+1.022),(xmax,ymax,rim+1.022)])
    mount('pool.fence.chimney-side',[(xmin,ymin,rim+1.035),(xmin,ymax,rim+1.035)])


def grade(x,y):
    def clamp(t): return min(1.,max(0.,t))
    front=-1.28-.31*clamp((-y-4)/10)
    rear=-2.57
    main=front+(rear-front)*clamp((y+.8)/10.8)
    drive=-1.60+(GARAGE_GRADE+1.60)*clamp((y+13)/13)
    drive+=.44*clamp((y-8.7)/3.5)
    across=clamp((x-3.0)/2.55)
    return main+(drive-main)*across


def surf(part,xs,ys,mat,offset):
    for x0,x1 in zip(xs,xs[1:]):
        for y0,y1 in zip(ys,ys[1:]):
            pts=[(x,y,grade(x,y)+offset) for x,y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]]
            part.poly(pts,[(0,1,2),(0,2,3)],mat)


def shrub(part,x,y,r,h,mat,seed):
    z=grade(x,y)-.10
    rings=[(.015,.53),(.17,.93),(.44,1.0),(.69,.83),(.86,.55),(.98,.18)]
    sides=10; verts=[]; faces=[]
    for layer,(ht,rad) in enumerate(rings):
        for i in range(sides):
            angle=2*math.pi*i/sides+(.18 if layer%2 else 0)
            rr=r*rad*(1+.08*math.sin(i*2.7+layer+seed))
            verts.append((x+rr*math.cos(angle),y+rr*math.sin(angle),z+h*ht))
    for j in range(len(rings)-1):
        for i in range(sides):
            a=j*sides+i; b=j*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(range(len(verts)-sides,len(verts))))
    part.poly(verts,faces,mat)


def build_ground():
    ys=[-13,-9,-5,-4,-2,0,4,8.7,10,12.2,16.5,20.4]
    xs=[-12,-7,-3,0,3,4.4,5.55,7.4,10.15,13.2]
    turf=Part("Graded lawn",grounds)
    surf(turf,xs,ys,lawn,-.035)
    for a,b in [((xs[0],ys[0]),(xs[-1],ys[0])),((xs[-1],ys[0]),(xs[-1],ys[-1])),((xs[-1],ys[-1]),(xs[0],ys[-1])),((xs[0],ys[-1]),(xs[0],ys[0]))]:
        axis=xs if a[1]==b[1] else ys
        seq=[(v,a[1]) for v in axis] if a[1]==b[1] else [(a[0],v) for v in axis]
        if seq[0]!=a: seq.reverse()
        for (x,y),(u,v) in zip(seq,seq[1:]):
            turf.poly([(x,y,-3.40),(u,v,-3.40),(u,v,grade(u,v)-.035),(x,y,grade(x,y)-.035)],[(0,1,2,3)],stone)
    turf.finish()
    drive=Part("Asphalt driveway and garage apron",grounds)
    surf(drive,[6.72,10.15],[-13,-9,-5,-2,0],asphalt,.005)
    surf(drive,[5.55,6.72,10.15],[0,4,8.7,10],asphalt,.005)
    drive.finish()
    walk=Part("Front walkway",grounds)
    surf(walk,[-.61,.98],[-13,-9,-5,PORCH_FRONT-1.62],path_mat,.005)
    walk.finish()
    retaining=Part("Driveway retaining wall",grounds)
    for i in range(12):
        y=-6.6+i*.54; bottom=grade(5.79,y)
        height=.22+.82*(i/11)
        retaining.box(5.57,5.95,y,y+.527,bottom-.05,bottom+height,stone)
        retaining.box(5.54,5.98,y-.006,y+.532,bottom+height,bottom+height+.065,base)
    retaining.finish()
    plants=Part("Evergreens and foundation shrubs",grounds)
    for i,(x,y,r,h) in enumerate([(-4.54,-2.96,.76,1.22),(-2.67,-2.94,.65,1.16),(2.75,-2.96,.68,1.06),(4.44,-2.98,.83,1.25),(-6.67,1.65,.75,2.25),(-6.77,5.45,.81,2.44),(11.15,-3.10,.98,3.75),(11.60,-.90,1.04,4.05),(11.39,1.32,1.0,3.95)]):
        shrub(plants,x,y,r,h,leaf if i<4 else needles,i)
    plants.finish()


def cloud_reference():
    raw_to_world=[(1.1475583,.15094445,-2.05094801,7.27869026),
                  (2.05627343,-.11870153,1.14180188,-3.36327184),
                  (-.03019189,-2.34716623,-.18963842,-6.49360924+EAVE)]
    with zipfile.ZipFile(OUT.parent/'Property alignment samples.zip') as z:
        data=z.read('front-and-driveway.ply').split(b'end_header\n',1)[1]
    verts=[]
    for x,y,z,*_ in struct.iter_unpack('<fffBBB',data):
        verts.append(tuple((a*x+b*y+c*z+d)*SCALE for a,b,c,d in raw_to_world))
    mesh=bpy.data.meshes.new("Front and driveway reference points")
    mesh.from_pydata(verts,[],[]); mesh.update()
    obj=bpy.data.objects.new("Registered front and driveway · 9271 points",mesh)
    references.objects.link(obj)
    obj.display_type='WIRE'
    references.hide_viewport=True
    references.hide_render=True


def camera(name,loc,target):
    data=bpy.data.cameras.new(name)
    obj=bpy.data.objects.new(name,data)
    studio.objects.link(obj)
    obj.location=Vector(loc)*SCALE
    obj.rotation_euler=(Vector(target)*SCALE-obj.location).to_track_quat('-Z','Y').to_euler()
    data.lens=45
    data.clip_end=200*SCALE
    obj.hide_set(True)
    return obj


build_shell()
build_openings()
dormer("left",-2.90)
dormer("right",3.04)
build_porch()
build_rear()
build_ground()
with_alignment = "--with-alignment" in sys.argv
if with_alignment:
    cloud_reference()
front_cam=camera("Front and driveway",(16.0,-29.2,10.1),(0,2.1,2.05))
rear_cam=camera("Rear pool",(16.8,37.8,16.5),(.5,10.6,1.45))
rear_cam.data.lens=38
stairs_cam=camera("Back stairs",(18.3,16.9,6.25),(5.75,10.35,-.42))
stairs_cam.data.lens=42
pool_cam=camera("Pool from upper porch",(2.6,11.87,1.74),(-.03,16.33,-1.33))
pool_cam.data.lens=17
scene.camera=front_cam
sun_data=bpy.data.lights.new("Daylight",'SUN')
sun_data.energy=2.5; sun_data.angle=math.radians(12)
sun=bpy.data.objects.new("Daylight",sun_data); studio.objects.link(sun)
sun.rotation_euler=Vector((.5,.55,-.88)).to_track_quat('-Z','Y').to_euler()
sun.hide_set(True)
scene.world=bpy.data.worlds.new("Overcast sky")
scene.world.use_nodes=True
scene.world.node_tree.nodes["Background"].inputs[0].default_value=(.71,.80,.91,1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value=.68
scene.render.engine='CYCLES'
scene.cycles.device='CPU'; scene.cycles.samples=8
scene.cycles.use_denoising=True; scene.cycles.denoiser='OPENIMAGEDENOISE'
scene.cycles.denoising_use_gpu=False
scene.render.threads_mode='FIXED'; scene.render.threads=1
scene.render.resolution_x=880; scene.render.resolution_y=540; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        space=area.spaces.active
        space.shading.color_type='MATERIAL'
        space.overlay.show_floor=False; space.overlay.show_axis_x=False; space.overlay.show_axis_y=False
        space.overlay.show_extras=False
        space.region_3d.view_rotation=front_cam.rotation_euler.to_quaternion()
        space.region_3d.view_distance=29*SCALE
        space.region_3d.view_location=Vector((0,2.2,2.1))*SCALE
bpy.ops.object.select_all(action='DESELECT')
for coll in (architecture,grounds,guides):
    for obj in coll.objects: obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'Lampey Property.glb'),export_format='GLB',
                          use_selection=True,export_extras=True,export_yup=True,
                          export_cameras=False,export_lights=False,export_animations=False)
bpy.ops.object.select_all(action='DESELECT')
scene.render.filepath='//Front and driveway.png'
scene_name = "Lampey Property.blend" if with_alignment else "Lampey Lights.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / scene_name))
if '--preview' in sys.argv:
    bpy.ops.render.render(write_still=True)
    scene.camera=rear_cam
    scene.render.filepath=str(OUT/'Rear pool.png')
    bpy.ops.render.render(write_still=True)
    scene.camera=stairs_cam
    scene.render.filepath=str(OUT/'Back stairs.png')
    bpy.ops.render.render(write_still=True)
    scene.camera=pool_cam
    scene.render.filepath=str(OUT/'Pool from upper porch.png')
    bpy.ops.render.render(write_still=True)
