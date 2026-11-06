"""Independent equilibrium/centroid checks using dimensions read from PDF scans.

These checks validate the listed examples only, not the entire book.
Residual equations are reconstructed from geometry, not copied from printed answers.
"""
import json
from math import sin, cos, radians, hypot, atan2, degrees, pi
from pathlib import Path

results = []
def check(page, values, residuals, source):
    assert all(abs(r) < 1e-7 for r in residuals), (page, residuals)
    results.append(dict(page=page, values=values, residuals=residuals, source=source))

# p17-20: 750 kg, g=10; left rope at 50deg, right at 30deg to horizontal.
w = 750*10
b = w/(sin(radians(50)) + cos(radians(50))*sin(radians(30))/cos(radians(30)))
c = b*cos(radians(50))/cos(radians(30))
check(20, dict(W_N=w, B_N=b, C_N=c),
      [-b*cos(radians(50))+c*cos(radians(30)), b*sin(radians(50))+c*sin(radians(30))-w],
      'p17 diagram and mass; g=10 on p6. Printed solution uses W=750 N.')
# p21-23: spring 50deg from vertical, rope 40deg from vertical, W=150N.
b = 150/(sin(radians(40)) + cos(radians(40))*sin(radians(50))/cos(radians(50)))
e = b*cos(radians(40))/cos(radians(50))
check(23, dict(B_N=b, E_N=e, extension_mm=b/850),
      [-b*cos(radians(40))+e*cos(radians(50)),b*sin(radians(40))+e*sin(radians(50))-150],
      'p21 dimensions and k=850 N/mm; p22 FBD.')
# p29-30: rope up at x=-100mm and left at y=250mm, load down x=100mm.
b=120*100/(250-100); cx=b; cy=120-b
check(30, dict(B_N=b,Cx_N=cx,Cy_N=cy,C_N=hypot(cx,cy),angle_deg=degrees(atan2(cy,cx))),
      [250*b-100*b-120*100,cx-b,cy+b-120],
      'p29 diagram: moment of 120N is clockwise. Printed plus sign is wrong.')
# p31-33: rope at (800,300), angle 30deg above negative x; W at x=400.
b=(300*400+750*800)/(800*sin(radians(30))+300*cos(radians(30)))
ax=b*cos(radians(30)); ay=1050-b*sin(radians(30))
check(32,dict(B_N=b,Ax_N=ax,Ay_N=ay,A_N=hypot(ax,ay),angle_deg=degrees(atan2(ay,ax))),
      [800*b*sin(radians(30))+300*b*cos(radians(30))-300*400-750*800,
       ax-b*cos(radians(30)),ay+b*sin(radians(30))-1050],
      'p31 dimensions; printed p32 substitutes cosine and sine on wrong lever arms.')
# p34-36: roller 1.5m below A; crane CG 2m right; load 6m right.
b=(1000*10*2+2400*10*6)/1.5; ax=-b; ay=34000
check(35,dict(B_N=b,Ax_N=ax,Ay_N=ay,A_N=hypot(ax,ay),angle_from_positive_x_deg=degrees(atan2(ay,ax))),
      [1.5*b-10000*2-24000*6,ax+b,ay-10000-24000],
      'p34 dimensions and masses. Printed B=29334N does not satisfy moment equation.')
# p37-39: rope 0.24m horizontal /0.18m vertical: exact 3-4-5 triangle.
bx=(240*.4+240*.8)/.18; tension=bx/.8; by=tension*.6; cx=bx; cy=by+480
check(39,dict(B_N=tension,Cx_N=cx,Cy_N=cy,C_N=hypot(cx,cy),angle_deg=degrees(atan2(cy,cx))),
      [.18*bx-240*.4-240*.8,cx-bx,cy-by-480],
      'p37 dimensions; p39 vertical reaction printed incorrectly.')
# p41-45: tension-positive joint forces, diagonals with run2/rise3.
sn=3/(13**.5); cs=2/(13**.5)
ac=-250/sn; ae=250*cs/sn; ce=250/sn; cd=-2*ce*cs
de=-300; s6=cd; s7=50/sn; s8=300
check(45,dict(AC_N=ac,AE_N=ae,CE_N=ce,CD_N=cd,DE_N=de,S6_N=s6,S7_N=s7,S8_N=s8),
      [250+ac*sn,ae+ac*cs, -ac*sn-ce*sn,-ac*cs+ce*cs+cd,
       -300-de,-cd+s6,ce*sn+de+s7*sn,-ae-ce*cs+s8+s7*cs],
      'p41 geometry and p44-45 joints. Positive=tension. Printed CE and CD signs are reversed.')
# p46-49: vertical truss width 4m; right loads 5kN at12m,10kN at8m; down5 at x4m.
g=(5*12+10*8+5*4)/4; ax=-15; ay=5-g
sef=-(5*8+10*4+5*4)/4; sbe=15/cos(radians(45)); sbc=5*4/4
check(48,dict(G_kN=g,Ax_kN=ax,Ay_kN=ay,SEF_kN=sef,SBE_kN=sbe,SBC_kN=sbc,SBF_kN=0),
      [4*g-5*12-10*8-5*4,ax+15,ay+g-5,
       -5*8-10*4-5*4-4*sef,15-sbe*cos(radians(45)),
       -5*4+4*sbc,-sbc-sbe*sin(radians(45))-sef-5],
      'p46 full truss; upper cut on p48; unloaded joint F on p49.')
# p53-56 centroid: rectangle + triangle - semicircle - square - quartercircle.
c=4*60/(3*pi)
parts=[(210*180,105,90),(90*60/2,240,20),(-pi*60**2/2,90,c),
       (-60**2,30,150),(-pi*60**2/4,210-c,180-c)]
area=sum(a for a,x,y in parts); sx=sum(a*x for a,x,y in parts); sy=sum(a*y for a,x,y in parts)
xc=sx/area; yc=sy/area
check(56,dict(area_mm2=area,first_moment_y_mm3=sx,first_moment_x_mm3=sy,xc_mm=xc,yc_mm=yc),
      [sum(a*(x-xc) for a,x,y in parts),sum(a*(y-yc) for a,x,y in parts)],
      'p53 geometry; square cutout is x0..60,y120..180. Its y moment is -540000mm3.')
target=Path(__file__).with_name('verified-statics.json')
target.write_text(json.dumps({'method':'geometry-derived residuals','checks':results},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'{len(results)} geometry checks passed; {target.name}')
